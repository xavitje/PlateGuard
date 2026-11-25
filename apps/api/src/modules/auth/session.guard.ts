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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Development sign-in: the user id in a header. Replaced by PIN login and a session token. */
export const DEV_USER_HEADER = 'x-plateguard-user';

/**
 * Fills the request with who is asking and, for routes under /locations/:locationId, which
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

    const userId = devUserId(req.headers[DEV_USER_HEADER]);
    if (userId) {
      const principal = await this.auth.findPrincipal(userId);
      if (!principal) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
      req.principal = principal;
    }

    const locationId = req.params?.locationId;
    if (locationId !== undefined) {
      if (!req.principal) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
      if (!UUID.test(locationId)) throw new NotFoundException({ code: 'LOCATION_NOT_FOUND' });
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

function devUserId(header: string | string[] | undefined): string | null {
  if (process.env.AUTH_MODE !== 'dev') return null;
  const value = Array.isArray(header) ? header[0] : header;
  return value && UUID.test(value) ? value : null;
}
