import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { LoginResponse } from '@plateguard/contracts';
import type {
  Plan,
  PlatformRestaurant,
  PlatformStats,
  Signup,
  StaffInput,
  StaffMember,
} from '@plateguard/contracts';
import { AuthRepository } from '../auth/auth.repository.js';
import { AuthService, slugify } from '../auth/auth.service.js';
import { issueToken } from '../auth/token.js';
import { StaffRepository } from '../setup/staff.repository.js';
import { PlatformRepository } from './platform.repository.js';

/** How long a restaurant stays open for a platform admin before they open it again. */
export const OPEN_SECONDS = 2 * 60 * 60;

/**
 * What the platform admin does for restaurants: make one on request, set its plan, and add
 * people or reset a PIN. Changes inside a restaurant run in that restaurant's tenant (the same
 * code its own managers use) and land in its audit trail.
 */
@Injectable()
export class RestaurantsService {
  constructor(
    private readonly repo: PlatformRepository,
    private readonly auth: AuthRepository,
    private readonly staff: StaffRepository,
    private readonly authService: AuthService,
  ) {}

  /**
   * Opens a restaurant as its owner: a shift session on that location, bound to this admin and
   * shorter than a shift. No PIN of the owner is needed; the opening lands in the audit trail.
   */
  async open(admin: { id: string; email: string }, locationId: string): Promise<LoginResponse> {
    const { location } = await this.tenant(locationId);
    const userId = await this.repo.actingUser(admin.id);
    await this.repo.audit(location.organizationId, location.id, admin.email, {
      type: 'platform.restaurant.opened',
      entity: 'location',
      entityId: location.id,
    });
    const session = issueToken(
      { sub: userId, loc: location.id, adm: admin.id },
      Date.now(),
      OPEN_SECONDS,
    );
    const principal = {
      userId,
      grants: [
        { organizationId: location.organizationId, locationId: null, role: 'OWNER' as const },
      ],
    };
    return { ...session, me: await this.authService.me(principal, location.id, admin.email) };
  }

  list(): Promise<PlatformRestaurant[]> {
    return this.repo.restaurants();
  }

  stats(): Promise<PlatformStats> {
    return this.repo.stats();
  }

  /** The same restaurant as the free start makes, without signing anyone in. */
  async create(admin: string, input: Signup & { plan: Plan }): Promise<PlatformRestaurant[]> {
    if (await this.auth.emailTaken(input.email))
      throw new ConflictException({ code: 'EMAIL_TAKEN' });
    const slug = await this.auth.freeSlug(slugify(input.restaurant));
    const made = await this.auth.createRestaurant({ ...input, slug });
    await this.repo.audit(made.organizationId, null, admin, {
      type: 'platform.restaurant.created',
      entity: 'organization',
      entityId: made.organizationId,
      payload: { plan: input.plan },
    });
    return this.list();
  }

  async setPlan(admin: string, organizationId: string, plan: Plan): Promise<PlatformRestaurant[]> {
    if (!(await this.repo.setPlan(organizationId, plan)))
      throw new NotFoundException({ code: 'RESTAURANT_NOT_FOUND' });
    await this.repo.audit(organizationId, null, admin, {
      type: 'platform.plan.changed',
      entity: 'organization',
      entityId: organizationId,
      payload: { plan },
    });
    return this.list();
  }

  async staffOf(locationId: string): Promise<StaffMember[]> {
    const { ctx, location } = await this.tenant(locationId);
    return this.staff.list(ctx, location);
  }

  async addStaff(admin: string, locationId: string, input: StaffInput): Promise<StaffMember[]> {
    const { ctx, location } = await this.tenant(locationId);
    if (input.pin && (await this.staff.pinTaken(ctx, location, input.name, input.pin)))
      throw new ConflictException({ code: 'PIN_TAKEN' });
    await this.staff.create(ctx, location, input);
    await this.repo.audit(location.organizationId, location.id, admin, {
      type: 'platform.staff.added',
      entity: 'location',
      entityId: location.id,
      payload: { name: input.name, roles: input.roles },
    });
    return this.staff.list(ctx, location);
  }

  /** A new PIN, which also unlocks a locked one. */
  async setPin(
    admin: string,
    locationId: string,
    userId: string,
    pin: string,
  ): Promise<StaffMember[]> {
    const { ctx, location } = await this.tenant(locationId);
    const member = (await this.staff.list(ctx, location)).find((m) => m.id === userId);
    if (!member) throw new NotFoundException({ code: 'STAFF_NOT_FOUND' });
    if (await this.staff.pinTaken(ctx, location, member.name, pin, userId))
      throw new ConflictException({ code: 'PIN_TAKEN' });
    await this.staff.setPin(ctx, location, userId, pin);
    await this.repo.audit(location.organizationId, location.id, admin, {
      type: 'platform.pin.reset',
      entity: 'user',
      entityId: userId,
    });
    return this.staff.list(ctx, location);
  }

  /** The tenant of one location: row-level security then keeps every query inside it. */
  private async tenant(locationId: string) {
    const location = await this.auth.findLocation(locationId);
    if (!location) throw new NotFoundException({ code: 'LOCATION_NOT_FOUND' });
    return {
      location,
      ctx: { organizationId: location.organizationId, locationIds: [location.id] },
    };
  }
}
