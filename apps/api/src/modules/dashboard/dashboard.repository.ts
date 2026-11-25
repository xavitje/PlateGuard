import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service.js';
import type { TenantContext } from '../auth/permissions.js';

export interface DashboardPlate {
  id: string;
  locationId: string;
  status: string;
  createdAt: Date;
  visitClosed: boolean;
  outcome: string | null;
  /** The guest's allergies as the engine saw them when ordered. */
  guest: { allergen?: string; ingredient?: { name: string }; custom?: string }[];
  kitchenCheckAt: Date | null;
  passChecked: boolean;
}

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Every location of the organization; the service keeps those the user may see. */
  locations(organizationId: string) {
    return this.prisma.system().location.findMany({
      where: { organizationId },
      select: { id: true, name: true, passCheck: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * The plates ordered in the period with what the dashboard needs. The assessment's input is
   * kept as it was, so the guest's allergies are those at ordering, not today's.
   */
  plates(ctx: TenantContext, from: Date): Promise<DashboardPlate[]> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const rows = await tx.plateOrder.findMany({
        where: {
          locationId: { in: ctx.locationIds },
          createdAt: { gte: from },
          status: { not: 'CANCELLED' },
        },
        select: {
          id: true,
          locationId: true,
          status: true,
          createdAt: true,
          visit: { select: { closedAt: true } },
          assessment: { select: { outcome: true, input: true } },
          checks: { select: { kind: true, at: true }, orderBy: { at: 'asc' } },
        },
      });
      return rows.map((r) => {
        const input = r.assessment?.input as { guest?: DashboardPlate['guest'] } | undefined;
        return {
          id: r.id,
          locationId: r.locationId,
          status: r.status,
          createdAt: r.createdAt,
          visitClosed: !!r.visit.closedAt,
          outcome: r.assessment?.outcome ?? null,
          guest: Array.isArray(input?.guest) ? input.guest : [],
          kitchenCheckAt: r.checks.find((c) => c.kind === 'KITCHEN')?.at ?? null,
          passChecked: r.checks.some((c) => c.kind === 'PASS'),
        };
      });
    });
  }

  /** When each plate was served, from the audit trail. */
  servedAt(ctx: TenantContext, plateIds: string[]): Promise<Map<string, Date>> {
    if (plateIds.length === 0) return Promise.resolve(new Map());
    return this.prisma.forTenant(ctx, async (tx) => {
      const rows = await tx.auditEvent.findMany({
        where: { type: 'plate.served', entityId: { in: plateIds } },
        select: { entityId: true, at: true },
      });
      return new Map(rows.map((r) => [r.entityId, r.at]));
    });
  }

  incidents(ctx: TenantContext, from: Date) {
    return this.prisma.forTenant(ctx, (tx) =>
      tx.incident.findMany({
        where: { locationId: { in: ctx.locationIds }, reportedAt: { gte: from } },
        select: { locationId: true, status: true },
      }),
    );
  }
}
