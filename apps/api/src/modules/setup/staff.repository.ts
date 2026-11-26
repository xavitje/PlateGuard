import { Injectable } from '@nestjs/common';
import type { StaffCandidate, StaffMember } from '@plateguard/contracts';
import { hashPin, verifyPin } from '@plateguard/db';
import type { Role } from '@plateguard/domain';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service.js';
import { MAX_PIN_TRIES } from '../auth/auth.service.js';
import { firstNameKey } from '../auth/first-name.js';
import type { TenantContext } from '../auth/permissions.js';

type Location = { id: string; organizationId: string };

/** Role assignments and PINs of one location, under row-level security. */
@Injectable()
export class StaffRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(ctx: TenantContext, location: Location): Promise<StaffMember[]> {
    return this.people(ctx, location).then((p) => p.here);
  }

  /** People with a role at another location of the organization and none here. */
  candidates(ctx: TenantContext, location: Location): Promise<StaffCandidate[]> {
    return this.people(ctx, location).then((p) => p.others);
  }

  /**
   * Every role assignment of the organization (role_assignment is organization scoped), split
   * into the people of this location and the people of the other locations.
   */
  private async people(ctx: TenantContext, location: Location) {
    const [roles, pins, names] = await Promise.all([
      this.prisma.forTenant(ctx, (tx) =>
        tx.roleAssignment.findMany({
          where: { organizationId: location.organizationId },
          include: { user: { select: { id: true, name: true } } },
        }),
      ),
      this.prisma.forTenant(ctx, (tx) =>
        tx.staffPin.findMany({ where: { locationId: location.id } }),
      ),
      // Only names: the other locations are outside this location's row-level security context.
      this.prisma
        .system()
        .location.findMany({
          where: { organizationId: location.organizationId },
          select: { id: true, name: true },
        })
        .then((ls) => new Map(ls.map((l) => [l.id, l.name]))),
    ]);
    const here = new Map<string, StaffMember>();
    const elsewhere = new Map<string, { name: string; locations: Set<string> }>();
    for (const r of roles) {
      if (r.locationId === null || r.locationId === location.id) {
        const p = here.get(r.userId) ?? {
          id: r.userId,
          name: r.user.name,
          roles: [],
          orgRoles: [],
          hasPin: false,
          locked: false,
          elsewhere: [],
        };
        (r.locationId ? p.roles : p.orgRoles).push(r.role as Role);
        here.set(r.userId, p);
      } else {
        const e = elsewhere.get(r.userId) ?? { name: r.user.name, locations: new Set<string>() };
        e.locations.add(names.get(r.locationId) ?? '');
        elsewhere.set(r.userId, e);
      }
    }
    for (const pin of pins) {
      const p = here.get(pin.userId);
      if (p) Object.assign(p, { hasPin: true, locked: pin.failedTries >= MAX_PIN_TRIES });
    }
    for (const [id, e] of elsewhere) {
      const p = here.get(id);
      if (p) p.elsewhere = [...e.locations].sort();
    }
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    return {
      here: [...here.values()].sort(byName),
      others: [...elsewhere]
        .filter(([id]) => !here.has(id))
        .map(([id, e]) => ({ id, name: e.name, locations: [...e.locations].sort() }))
        .sort(byName),
    };
  }

  /**
   * Whether someone else here with the same first name already has this PIN. People sign in
   * with first name and PIN, so that pair has to point to one person.
   */
  pinTaken(
    ctx: TenantContext,
    location: Location,
    name: string,
    pin: string,
    exceptUserId?: string,
  ): Promise<boolean> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const pins = await tx.staffPin.findMany({
        where: {
          locationId: location.id,
          ...(exceptUserId ? { NOT: { userId: exceptUserId } } : {}),
        },
        select: { pinHash: true, user: { select: { name: true } } },
      });
      const key = firstNameKey(name);
      const same = pins.filter((p) => firstNameKey(p.user.name) === key);
      const checks = await Promise.all(same.map((p) => verifyPin(pin, p.pinHash)));
      return checks.some(Boolean);
    });
  }

  async create(
    ctx: TenantContext,
    location: Location,
    input: { name: string; roles: Role[]; pin?: string },
  ): Promise<void> {
    const id = randomUUID();
    const pinHash = input.pin ? await hashPin(input.pin) : null;
    await this.prisma.forTenant(ctx, async (tx) => {
      // createMany: the new user becomes visible to this tenant only once it has a role here.
      await tx.user.createMany({ data: [{ id, name: input.name }] });
      await tx.roleAssignment.createMany({ data: assignments(id, location, input.roles) });
      if (pinHash)
        await tx.staffPin.create({ data: { userId: id, locationId: location.id, pinHash } });
    });
  }

  update(
    ctx: TenantContext,
    location: Location,
    id: string,
    input: { name: string; roles: Role[] },
  ): Promise<void> {
    return this.prisma.forTenant(ctx, async (tx) => {
      await tx.user.update({ where: { id }, data: { name: input.name } });
      await tx.roleAssignment.deleteMany({
        where: { userId: id, organizationId: location.organizationId, locationId: location.id },
      });
      await tx.roleAssignment.createMany({ data: assignments(id, location, input.roles) });
    });
  }

  /** Someone from another location of the organization starts here with these roles and PIN. */
  async link(
    ctx: TenantContext,
    location: Location,
    id: string,
    input: { roles: Role[]; pin: string },
  ): Promise<void> {
    const pinHash = await hashPin(input.pin);
    await this.prisma.forTenant(ctx, async (tx) => {
      await tx.roleAssignment.createMany({ data: assignments(id, location, input.roles) });
      await tx.staffPin.create({ data: { userId: id, locationId: location.id, pinHash } });
    });
  }

  /** Also resets the wrong tries, which unlocks a locked PIN. */
  async setPin(ctx: TenantContext, location: Location, id: string, pin: string): Promise<void> {
    const pinHash = await hashPin(pin);
    await this.prisma.forTenant(ctx, (tx) =>
      tx.staffPin.upsert({
        where: { userId_locationId: { userId: id, locationId: location.id } },
        create: { userId: id, locationId: location.id, pinHash },
        update: { pinHash, failedTries: 0 },
      }),
    );
  }

  remove(ctx: TenantContext, location: Location, id: string): Promise<void> {
    return this.prisma.forTenant(ctx, async (tx) => {
      await tx.roleAssignment.deleteMany({
        where: { userId: id, organizationId: location.organizationId, locationId: location.id },
      });
      await tx.staffPin.deleteMany({ where: { userId: id, locationId: location.id } });
    });
  }
}

function assignments(userId: string, location: Location, roles: Role[]) {
  return [...new Set(roles)].map((role) => ({
    userId,
    organizationId: location.organizationId,
    locationId: location.id,
    role,
  }));
}
