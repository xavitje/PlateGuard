import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { allowedLocationIds } from '@plateguard/domain';
import { AuthRepository } from './auth.repository.js';
import type { AuthedRequest } from './permissions.js';
import { readToken, type SessionClaims } from './token.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Development sign-in for scripts and local tools: the user id in a header, only with AUTH_MODE=dev. */
export const DEV_USER_HEADER = 'x-plateguard-user';

/**
 * Fills the request with who is asking (a PIN session token, or the development header) and,
 * for routes under /locations/:locationId, which
 * location and tenant. Runs before PermissionGuard. Routes without a user stay public
 * (health, webhooks); routes that need one are marked with RequirePermission.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<
      AuthedRequest & {
        headers: Record<string, string | string[] | undefined>;
        params?: Record<string, string>;
      }
    >();

    const claims = bearer(req.headers.authorization);
    const userId = claims?.sub ?? devUserId(req.headers[DEV_USER_HEADER]);
    if (claims) req.sessionLocation = claims.loc;
    if (userId) {
      const principal = await this.auth.findPrincipal(userId);
      if (!principal) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
      if (claims?.adm) {
        // A platform admin acting as owner of this one restaurant, for as long as the token runs.
        const opened = await this.auth.openedByPlatform(claims.adm, userId, claims.loc);
        if (!opened) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
        principal.grants = [
          { organizationId: opened.organizationId, locationId: null, role: 'OWNER' },
        ];
        req.platformAdmin = opened.email;
      }
      req.principal = principal;
    }

    const locationId = req.params?.locationId;
    if (locationId !== undefined) {
      if (!req.principal) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
      if (!UUID.test(locationId)) throw new NotFoundException({ code: 'LOCATION_NOT_FOUND' });
      // A PIN session works on the location it was opened on, nowhere else.
      if (req.sessionLocation && req.sessionLocation !== locationId)
        throw new ForbiddenException({ code: 'FORBIDDEN' });
      const location = await this.auth.findLocation(locationId);
      if (!location) throw new NotFoundException({ code: 'LOCATION_NOT_FOUND' });
      const visible = allowedLocationIds(req.principal, location.organizationId, [location.id]);
      if (!visible.includes(location.id)) throw new ForbiddenException({ code: 'FORBIDDEN' });
      req.location = { id: location.id, organizationId: location.organizationId };
      req.tenant = {
        organizationId: location.organizationId,
        locationIds: [location.id],
        userId: req.principal.userId,
      };
    }
    return true;
  }
}

function bearer(header: string | string[] | undefined): SessionClaims | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith('Bearer ')) return null;
  return readToken(value.slice(7));
}

function devUserId(header: string | string[] | undefined): string | null {
  if (process.env.AUTH_MODE !== 'dev') return null;
  const value = Array.isArray(header) ? header[0] : header;
  return value && UUID.test(value) ? value : null;
}
