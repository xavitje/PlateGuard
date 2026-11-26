import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { readPlatformToken } from '../auth/token.js';
import { PlatformRepository } from './platform.repository.js';

interface PlatformRequest {
  headers: Record<string, string | string[] | undefined>;
  platformAdmin?: { id: string; email: string };
}

/**
 * Only a platform token opens /platform routes. A restaurant's PIN token is refused here, and
 * a platform token opens no restaurant route (readToken refuses it).
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly repo: PlatformRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PlatformRequest>();
    const header = req.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    const claims = value?.startsWith('Bearer ') ? readPlatformToken(value.slice(7)) : null;
    if (!claims) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    const admin = await this.repo.findById(claims.sub);
    if (!admin) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    req.platformAdmin = admin;
    return true;
  }
}

export const CurrentPlatformAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<PlatformRequest>();
  if (!req.platformAdmin) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
  return req.platformAdmin;
});
