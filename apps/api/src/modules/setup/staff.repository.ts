import { Injectable } from '@nestjs/common';
import type { StaffMember } from '@plateguard/contracts';
import { hashPin } from '@plateguard/db';
import type { Role } from '@plateguard/domain';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service.js';
import { MAX_PIN_TRIES } from '../auth/auth.service.js';
import type { TenantContext } from '../auth/permissions.js';

type Location = { id: string; organizationId: string };

/** Role assignments and PINs of one location, under row-level security. */
@Injectable()
export class StaffRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(ctx: TenantContext, location: Location): Promise<StaffMember[]> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const [roles, pins] = await Promise.all([
        tx.roleAssignment.findMany({
          where: {
            organizationId: location.organizationId,
            OR: [{ locationId: location.id }, { locationId: null }],
          },
          include: { user: { select: { id: true, name: true } } },
        }),
        tx.staffPin.findMany({ where: { locationId: location.id } }),
      ]);
      const people = new Map<string, StaffMember>();
      for (const r of roles) {
        const p = people.get(r.userId) ?? {
          id: r.userId,
          name: r.user.name,
          roles: [],
          orgRoles: [],
          hasPin: false,
          locked: false,
        };
        (r.locationId ? p.roles : p.orgRoles).push(r.role as Role);
        people.set(r.userId, p);
      }
      for (const pin of pins) {
        const p = people.get(pin.userId);
        if (p) Object.assign(p, { hasPin: true, locked: pin.failedTries >= MAX_PIN_TRIES });
      }
      return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
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
