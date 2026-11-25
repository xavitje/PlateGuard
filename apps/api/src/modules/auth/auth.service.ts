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
} from '@plateguard/contracts';
import { allowedLocationIds, can, PERMISSIONS, type Principal } from '@plateguard/domain';
import { firstNameKey } from './first-name.js';
import { AuthRepository } from './auth.repository.js';
import { issueToken } from './token.js';

/** After this many wrong PINs in a row, a manager has to set a new PIN. */
export const MAX_PIN_TRIES = 5;

@Injectable()
export class AuthService {
  constructor(private readonly auth: AuthRepository) {}

  /**
   * The signed-in user and the locations they may work in. A PIN session is bound to the
   * location it was opened on; the development header sees every location of the user.
   */
  async me(principal: Principal, sessionLocation?: string): Promise<MeResponse> {
    const full = await this.auth.findPrincipal(principal.userId);
    if (!full) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    const orgIds = [...new Set(full.grants.map((g) => g.organizationId))];
    const all = await this.auth.locationsOf(orgIds);
    const locations = all.filter(
      (l) =>
        (!sessionLocation || l.id === sessionLocation) &&
        allowedLocationIds(full, l.organizationId, [l.id]).includes(l.id),
    );
    return {
      user: { id: full.userId, name: full.name, locale: full.locale },
      locations: locations.map((l) => ({
        ...l,
        permissions: PERMISSIONS.filter((p) => can(full, p, l)),
      })),
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
   * First name and PIN, per location. The first name narrows it down to a person (or a few
   * with the same first name); the PIN decides who it is. Every wrong PIN counts against those
   * people, and the fifth locks the PIN until a manager sets a new one.
   */
  async loginWithPin(input: PinLogin): Promise<LoginResponse> {
    const key = firstNameKey(input.name);
    const candidates = (await this.auth.pins(input.locationId)).filter(
      (p) => firstNameKey(p.user.name) === key,
    );
    if (candidates.length === 0) throw new UnauthorizedException({ code: 'NAME_UNKNOWN' });
    const open = candidates.filter((c) => c.failedTries < MAX_PIN_TRIES);
    if (open.length === 0) throw new HttpException({ code: 'PIN_LOCKED' }, HttpStatus.LOCKED);

    const checks = await Promise.all(open.map((c) => this.auth.pinMatches(input.pin, c.pinHash)));
    const found = open.filter((_, i) => checks[i]);
    if (found.length === 0) {
      const tries = await Promise.all(
        open.map(async (c) => {
          await this.auth.setFailedTries(c.userId, input.locationId, c.failedTries + 1);
          return c.failedTries + 1;
        }),
      );
      const left = MAX_PIN_TRIES - Math.max(...tries);
      if (left <= 0) throw new HttpException({ code: 'PIN_LOCKED' }, HttpStatus.LOCKED);
      throw new UnauthorizedException({ code: 'PIN_INVALID', details: { triesLeft: left } });
    }
    // Two people with the same first name and PIN: setting a PIN prevents this, but say so.
    if (found.length > 1) throw new ConflictException({ code: 'LOGIN_AMBIGUOUS' });
    const row = found[0]!;
    if (row.failedTries > 0) await this.auth.setFailedTries(row.userId, input.locationId, 0);

    const principal = await this.auth.findPrincipal(row.userId);
    const location = await this.auth.findLocation(input.locationId);
    if (
      !principal ||
      !location ||
      !allowedLocationIds(principal, location.organizationId, [location.id]).includes(location.id)
    )
      throw new ForbiddenException({ code: 'FORBIDDEN' });

    const session = issueToken({ sub: principal.userId, loc: location.id });
    return { ...session, me: await this.me(principal, location.id) };
  }
}
