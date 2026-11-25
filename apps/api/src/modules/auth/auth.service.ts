import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { LoginResponse, MeResponse, PinLogin, StaffListResponse } from '@plateguard/contracts';
import { allowedLocationIds, can, PERMISSIONS, type Principal } from '@plateguard/domain';
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

  async staff(slug: string): Promise<StaffListResponse> {
    const location = await this.auth.findLocationBySlug(slug);
    if (!location) throw new NotFoundException({ code: 'LOCATION_NOT_FOUND' });
    return {
      location: { id: location.id, name: location.name },
      staff: await this.auth.staffWithPin(location.id),
    };
  }

  /** PIN per person, per location. Every failure counts; the fifth locks the PIN. */
  async loginWithPin(input: PinLogin): Promise<LoginResponse> {
    const row = await this.auth.findPin(input.userId, input.locationId);
    if (!row) throw new UnauthorizedException({ code: 'PIN_INVALID' });
    if (row.failedTries >= MAX_PIN_TRIES)
      throw new HttpException({ code: 'PIN_LOCKED' }, HttpStatus.LOCKED);
    if (!(await this.auth.pinMatches(input.pin, row.pinHash))) {
      const tries = row.failedTries + 1;
      await this.auth.setFailedTries(input.userId, input.locationId, tries);
      if (tries >= MAX_PIN_TRIES)
        throw new HttpException({ code: 'PIN_LOCKED' }, HttpStatus.LOCKED);
      throw new UnauthorizedException({
        code: 'PIN_INVALID',
        details: { triesLeft: MAX_PIN_TRIES - tries },
      });
    }
    if (row.failedTries > 0) await this.auth.setFailedTries(input.userId, input.locationId, 0);

    const principal = await this.auth.findPrincipal(input.userId);
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
