import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  LoginResponse,
  MeResponse,
  PinLogin,
  SignInLocationResponse,
  Signup,
} from '@plateguard/contracts';
import { allowedLocationIds, can, PERMISSIONS, type Principal } from '@plateguard/domain';
import { firstNameKey } from './first-name.js';
import { AuthRepository } from './auth.repository.js';
import { issueToken } from './token.js';

/** After this many wrong PINs in a row, a manager has to set a new PIN. */
export const MAX_PIN_TRIES = 5;

/** Compared when nothing real is: an unknown name or email takes as long as a wrong secret. */
export const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

@Injectable()
export class AuthService {
  constructor(private readonly auth: AuthRepository) {}

  /**
   * The signed-in user and the locations they may work in. A PIN session is bound to the
   * location it was opened on; the development header sees every location of the user.
   */
  async me(
    principal: Principal,
    sessionLocation?: string,
    platformAdmin?: string,
  ): Promise<MeResponse> {
    const stored = await this.auth.findPrincipal(principal.userId);
    if (!stored) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    // The grants as the session holds them: a platform admin's come from the token.
    const full = { ...stored, grants: principal.grants };
    const orgIds = [...new Set(full.grants.map((g) => g.organizationId))];
    const all = await this.auth.locationsOf(orgIds);
    const allowed = all.filter((l) =>
      allowedLocationIds(full, l.organizationId, [l.id]).includes(l.id),
    );
    const locations = allowed.filter((l) => !sessionLocation || l.id === sessionLocation);
    return {
      ...(platformAdmin ? { platformAdmin } : {}),
      user: { id: full.userId, name: full.name, locale: full.locale },
      locations: locations.map((l) => ({
        ...l,
        permissions: PERMISSIONS.filter((p) => can(full, p, l)),
      })),
      elsewhere: allowed
        .filter((l) => !locations.includes(l))
        .map(({ id, name, slug }) => ({ id, name, slug })),
    };
  }

  async signInLocation(slug: string): Promise<SignInLocationResponse> {
    const location = await this.auth.findLocationBySlug(slug);
    if (!location) throw new NotFoundException({ code: 'LOCATION_NOT_FOUND' });
    return {
      location: { id: location.id, name: location.name },
      hasStaff: await this.auth.hasPins(location.id),
    };
  }

  /**
   * First name and PIN. The first name narrows it down to a person (or a few with the same
   * first name); the PIN decides who it is. Every wrong PIN counts against those people, and the
   * fifth locks the PIN until a manager sets a new one. Only the PINs of the given location are
   * compared: a new device asks for its restaurant first, so a wrong PIN can never count against
   * (or match) staff of another restaurant.
   */
  async loginWithPin(input: PinLogin): Promise<LoginResponse> {
    const key = firstNameKey(input.name);
    const candidates = (await this.auth.pins(input.locationId)).filter(
      (p) => firstNameKey(p.user.name) === key,
    );
    // An unknown name answers like a wrong PIN, in the same time, so names cannot be probed.
    if (candidates.length === 0) {
      await this.auth.pinMatches(input.pin, DUMMY_HASH);
      throw new UnauthorizedException({ code: 'PIN_INVALID' });
    }
    // Each try is counted before the PIN is compared, so parallel guesses cannot share one count.
    const tries = await Promise.all(
      candidates.map((c) => this.auth.reserveTry(c.userId, c.locationId, MAX_PIN_TRIES)),
    );
    const open = candidates.filter((_, i) => tries[i] !== null);
    if (open.length === 0) throw new HttpException({ code: 'PIN_LOCKED' }, HttpStatus.LOCKED);

    const checks = await Promise.all(open.map((c) => this.auth.pinMatches(input.pin, c.pinHash)));
    const found = open.filter((_, i) => checks[i]);
    if (found.length === 0) {
      const left = MAX_PIN_TRIES - Math.max(...tries.filter((t) => t !== null));
      if (left <= 0) throw new HttpException({ code: 'PIN_LOCKED' }, HttpStatus.LOCKED);
      throw new UnauthorizedException({ code: 'PIN_INVALID' });
    }
    // Two people with the same first name and PIN: setting a PIN prevents this per location.
    if (found.length > 1) throw new ConflictException({ code: 'LOGIN_AMBIGUOUS' });
    const row = found[0]!;
    await Promise.all([
      this.auth.setFailedTries(row.userId, row.locationId, 0),
      // The right PIN was typed, so it was no wrong try for the others with this first name.
      ...open.filter((c) => c !== row).map((c) => this.auth.releaseTry(c.userId, c.locationId)),
    ]);

    const principal = await this.auth.findPrincipal(row.userId);
    const location = await this.auth.findLocation(row.locationId);
    if (
      !principal ||
      !location ||
      !allowedLocationIds(principal, location.organizationId, [location.id]).includes(location.id)
    )
      throw new ForbiddenException({ code: 'FORBIDDEN' });

    const session = issueToken({ sub: principal.userId, loc: location.id });
    return { ...session, me: await this.me(principal, location.id) };
  }

  /**
   * The free start: makes the restaurant and signs the owner in on it. The guest menu address
   * comes from the restaurant name.
   */
  async signup(input: Signup): Promise<LoginResponse> {
    if (await this.auth.emailTaken(input.email))
      throw new ConflictException({ code: 'EMAIL_TAKEN' });
    const slug = await this.auth.freeSlug(slugify(input.restaurant));
    const { userId, locationId } = await this.auth.createRestaurant({ ...input, slug });
    const principal = await this.auth.findPrincipal(userId);
    if (!principal) throw new ForbiddenException({ code: 'FORBIDDEN' });
    const session = issueToken({ sub: userId, loc: locationId });
    return { ...session, me: await this.me(principal, locationId) };
  }
}

/** "Café 't Hoekje" -> "cafe-t-hoekje": the guest menu address. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'restaurant';
}
