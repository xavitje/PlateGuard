import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  maxLocations,
  type LocationProfile,
  type NewLocation,
  type OrgLocationsResponse,
} from '@plateguard/contracts';
import { randomUUID } from 'node:crypto';
import { AuthRepository } from '../auth/auth.repository.js';
import { slugify } from '../auth/auth.service.js';
import type { TenantContext } from '../auth/permissions.js';
import { LocationsRepository } from './locations.repository.js';
import { ProfileRepository } from './profile.repository.js';

type Location = { id: string; organizationId: string };

/**
 * The owner's view of every location of the restaurant: list, add, rename. Only for
 * org.locations.manage, which only an owner has, so the context widens to all locations.
 */
@Injectable()
export class LocationsService {
  constructor(
    private readonly repo: LocationsRepository,
    private readonly profiles: ProfileRepository,
    private readonly auth: AuthRepository,
  ) {}

  async list(ctx: TenantContext, location: Location): Promise<OrgLocationsResponse> {
    const plan = await this.repo.plan(location.organizationId);
    return {
      plan,
      maxLocations: maxLocations(plan),
      locations: await this.repo.list(await this.orgContext(ctx, location)),
    };
  }

  async create(
    ctx: TenantContext,
    location: Location,
    input: NewLocation,
  ): Promise<OrgLocationsResponse> {
    const org = await this.orgContext(ctx, location);
    const max = maxLocations(await this.repo.plan(location.organizationId));
    if (max !== null && org.locationIds.length >= max)
      throw new ConflictException({ code: 'PLAN_LOCATION_LIMIT', details: { max } });
    const copyMenuFrom = input.copyMenuFrom ?? null;
    if (copyMenuFrom && !org.locationIds.includes(copyMenuFrom))
      throw new BadRequestException({ code: 'LOCATION_NOT_FOUND' });
    const id = randomUUID();
    await this.repo.create(
      { ...org, locationIds: [...org.locationIds, id] },
      {
        id,
        slug: await this.auth.freeSlug(slugify(input.name)),
        profile: { name: input.name, address: input.address, photo: input.photo },
        settingsFrom: location.id,
        copyMenuFrom,
        userId: ctx.userId!,
      },
    );
    return this.list(ctx, location);
  }

  async update(
    ctx: TenantContext,
    location: Location,
    id: string,
    profile: LocationProfile,
  ): Promise<OrgLocationsResponse> {
    const org = await this.orgContext(ctx, location);
    if (!org.locationIds.includes(id)) throw new NotFoundException({ code: 'LOCATION_NOT_FOUND' });
    await this.profiles.save(org, id, profile);
    return this.list(ctx, location);
  }

  private async orgContext(ctx: TenantContext, location: Location): Promise<TenantContext> {
    const all = await this.auth.locationsOf([location.organizationId]);
    return { ...ctx, locationIds: all.map((l) => l.id) };
  }
}
