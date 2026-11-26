import { Injectable } from '@nestjs/common';
import type { LocationProfile } from '@plateguard/contracts';
import type { TenantContext } from '../auth/permissions.js';
import { ProfileRepository } from './profile.repository.js';

/** The restaurant's name, address and photo. */
@Injectable()
export class ProfileService {
  constructor(private readonly repo: ProfileRepository) {}

  get(ctx: TenantContext, locationId: string): Promise<LocationProfile> {
    return this.repo.get(ctx, locationId);
  }

  save(ctx: TenantContext, locationId: string, profile: LocationProfile): Promise<LocationProfile> {
    return this.repo.save(ctx, locationId, profile);
  }
}
