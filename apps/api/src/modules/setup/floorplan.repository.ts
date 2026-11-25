import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminFloor, FloorInput, TableInput } from '@plateguard/contracts';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service.js';
import type { TenantContext } from '../auth/permissions.js';

/**
 * Floors and the tables on them, with the rules that need the data in the same transaction. Tables are never deleted: past visits point at them, so a
 * removed table is only made inactive. Labels are unique among the active tables, because
 * waiters and the app address a table by its label.
 */
@Injectable()
export class FloorplanRepository {
  constructor(private readonly prisma: PrismaService) {}

  floors(ctx: TenantContext, locationId: string): Promise<AdminFloor[]> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const [floors, points, open] = await Promise.all([
        tx.floor.findMany({ where: { locationId }, orderBy: { sortOrder: 'asc' } }),
        tx.servicePoint.findMany({ where: { locationId }, orderBy: { label: 'asc' } }),
        tx.visit.findMany({
          where: { locationId, closedAt: null },
          select: { servicePointId: true },
        }),
      ]);
      const inUse = new Set(open.map((v) => v.servicePointId));
      return floors.map((f) => ({
        id: f.id,
        name: f.name,
        hidden: f.hidden,
        tables: points
          .filter((p) => p.floorId === f.id)
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
          .map((p) => ({
            id: p.id,
            floorId: p.floorId,
            label: p.label,
            seats: p.seats,
            shape: p.shape,
            externalRef: p.externalRef,
            active: p.active,
            inUse: inUse.has(p.id),
          })),
      }));
    });
  }

  async saveFloor(ctx: TenantContext, locationId: string, id: string | null, input: FloorInput) {
    await this.prisma.forTenant(ctx, async (tx) => {
      if (id) {
        const found = await tx.floor.updateMany({ where: { id, locationId }, data: input });
        if (found.count === 0) throw new NotFoundException({ code: 'FLOOR_NOT_FOUND' });
        return;
      }
      const last = await tx.floor.findFirst({
        where: { locationId },
        orderBy: { sortOrder: 'desc' },
      });
      await tx.floor.create({
        data: { ...input, locationId, sortOrder: (last?.sortOrder ?? -1) + 1 },
      });
    });
    return this.floors(ctx, locationId);
  }

  async orderFloors(ctx: TenantContext, locationId: string, floorIds: string[]) {
    await this.prisma.forTenant(ctx, async (tx) => {
      const all = await tx.floor.findMany({ where: { locationId }, select: { id: true } });
      const ids = new Set(all.map((f) => f.id));
      if (floorIds.length !== ids.size || floorIds.some((id) => !ids.has(id)))
        throw new BadRequestException({ code: 'FLOOR_ORDER_INCOMPLETE' });
      for (const [sortOrder, id] of floorIds.entries())
        await tx.floor.update({ where: { id }, data: { sortOrder } });
    });
    return this.floors(ctx, locationId);
  }

  async saveTable(ctx: TenantContext, locationId: string, id: string | null, input: TableInput) {
    await this.prisma.forTenant(ctx, async (tx) => {
      const floor = await tx.floor.findFirst({ where: { id: input.floorId, locationId } });
      if (!floor) throw new BadRequestException({ code: 'FLOOR_NOT_FOUND' });
      if (input.active) {
        const clash = await tx.servicePoint.findFirst({
          where: { locationId, label: input.label, active: true, ...(id ? { NOT: { id } } : {}) },
        });
        if (clash) throw new BadRequestException({ code: 'TABLE_LABEL_TAKEN' });
      }
      const data = {
        floorId: input.floorId,
        label: input.label,
        seats: input.seats,
        shape: input.shape,
        externalRef: input.externalRef ?? null,
        active: input.active,
      };
      if (!id) {
        await tx.servicePoint.create({
          data: { ...data, locationId, qrToken: randomBytes(12).toString('base64url') },
        });
        return;
      }
      const before = await tx.servicePoint.findFirst({ where: { id, locationId } });
      if (!before) throw new NotFoundException({ code: 'TABLE_NOT_FOUND' });
      const open = await tx.visit.findFirst({
        where: { servicePointId: id, closedAt: null },
        include: { guests: { select: { seat: true } } },
      });
      if (open) {
        // Guests are seated: keep their seats and the address the waiters are using.
        const highest = Math.max(0, ...open.guests.map((g) => g.seat));
        if (input.seats < highest || !input.active || input.label !== before.label)
          throw new BadRequestException({ code: 'TABLE_IN_USE' });
      }
      await tx.servicePoint.update({ where: { id }, data });
    });
    return this.floors(ctx, locationId);
  }
}
