import {
  createParamDecorator,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type Permission, type Principal } from '@plateguard/domain';
import type { TenantContext } from '@plateguard/db';

export type { TenantContext };

const PERMISSION_KEY = 'pg:permission';

/** Marks a route with the permission it needs on the location in the request. */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

export interface AuthedRequest {
  principal?: Principal;
  /** Set by the auth layer from the active location (one per shift). */
  location?: { id: string; organizationId: string };
  /** Row-level security context for this request's location. */
  tenant?: TenantContext;
}

/** The tenant of a /locations/:locationId route, as set by SessionGuard. */
export const Tenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.tenant) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
  return req.tenant;
});

/** The signed-in user, as set by SessionGuard. */
export const CurrentPrincipal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.principal) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    return req.principal;
  },
);

/**
 * Enforces can(user, permission, location) in the API. The UI calls the same function only to hide buttons.
 * SessionGuard fills request.principal and request.location before this guard runs.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.principal || !req.location) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    if (!can(req.principal, permission, req.location))
      throw new ForbiddenException({ code: 'FORBIDDEN', details: { permission } });
    return true;
  }
}
