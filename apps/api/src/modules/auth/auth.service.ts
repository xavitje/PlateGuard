import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { MeResponse } from '@plateguard/contracts';
import { allowedLocationIds, type Principal } from '@plateguard/domain';
import { AuthRepository } from './auth.repository.js';

@Injectable()
export class AuthService {
  constructor(private readonly auth: AuthRepository) {}

  /** The signed-in user and every location they may work in. */
  async me(principal: Principal): Promise<MeResponse> {
    const full = await this.auth.findPrincipal(principal.userId);
    if (!full) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    const orgIds = [...new Set(full.grants.map((g) => g.organizationId))];
    const all = await this.auth.locationsOf(orgIds);
    const locations = all.filter((l) =>
      allowedLocationIds(full, l.organizationId, [l.id]).includes(l.id),
    );
    return { user: { id: full.userId, name: full.name, locale: full.locale }, locations };
  }
}
