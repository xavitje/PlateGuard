import { Injectable } from '@nestjs/common';
import type { Prisma, TenantContext, TenantTx } from '@plateguard/db';
import {
  normalizeLabel,
  type Assessment,
  type GuestAllergy,
  type Severity,
} from '@plateguard/domain';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service.js';

/** Plates that still matter for alerts: not served, rejected or cancelled. */
export const OPEN_PLATE_STATUSES = ['ASSESSED', 'IN_KITCHEN', 'CHECKED', 'PASS_CHECKED'] as const;

export interface SeatRow {
  guestId: string;
  seat: number;
  noAllergy: boolean;
  allergies: GuestAllergy[];
  orders: { id: string; dishId: string; outcome: Assessment['outcome'] }[];
}

export interface TableRow {
  id: string;
  label: string;
  seats: number;
  shape: 'ROUND' | 'SQUARE' | 'RECT';
  floorId: string | null;
  visitId: string | null;
  bySeat: SeatRow[];
}

const guestInclude = {
  allergies: { include: { ingredient: { select: { id: true, name: true } } } },
  plates: {
    where: { status: { in: [...OPEN_PLATE_STATUSES] } },
    include: { assessment: { select: { outcome: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.GuestInclude;

type GuestWithData = Prisma.GuestGetPayload<{ include: typeof guestInclude }>;

function toSeat(g: GuestWithData): SeatRow {
  return {
    guestId: g.id,
    seat: g.seat,
    noAllergy: g.noAllergy,
    allergies: g.allergies.map((a): GuestAllergy => {
      const severity = a.severity as Severity;
      if (a.allergenCode) return { allergen: a.allergenCode, severity };
      if (a.ingredient) return { ingredient: a.ingredient, severity };
      return { custom: a.customLabel ?? '', severity };
    }),
    orders: g.plates.flatMap((p) =>
      p.dishId ? [{ id: p.id, dishId: p.dishId, outcome: p.assessment?.outcome ?? 'UNKNOWN' }] : [],
    ),
  };
}

/** Every query runs through forTenant, so row-level security limits it to the location. */
@Injectable()
export class ServiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  floors(ctx: TenantContext, locationId: string) {
    return this.prisma.forTenant(ctx, async (tx) => {
      const [floors, tables] = await Promise.all([
        tx.floor.findMany({
          where: { locationId, hidden: false },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true },
        }),
        loadTables(tx, locationId),
      ]);
      return { floors, tables };
    });
  }

  table(ctx: TenantContext, locationId: string, label: string): Promise<TableRow | null> {
    return this.prisma.forTenant(
      ctx,
      async (tx) => (await loadTables(tx, locationId, label))[0] ?? null,
    );
  }

  /** Replaces a seat's allergies. Opens the visit and the guest on first use. */
  saveSeat(
    ctx: TenantContext,
    locationId: string,
    tableId: string,
    seat: number,
    input: { allergies: GuestAllergy[]; noAllergy: boolean },
    userId: string,
  ): Promise<void> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const guestId = await ensureGuest(tx, locationId, tableId, seat, userId);
      await tx.guestAllergy.deleteMany({ where: { guestId } });
      if (input.allergies.length > 0) {
        await tx.guestAllergy.createMany({
          data: input.allergies.map((a) => ({
            guestId,
            locationId,
            severity: a.severity ?? 'SEVERE',
            recordedById: userId,
            allergenCode: a.allergen ?? null,
            ingredientId: a.ingredient?.id ?? null,
            customLabel: a.custom?.trim() ?? null,
            customKey: a.custom !== undefined ? normalizeLabel(a.custom) : null,
          })),
        });
      }
      await tx.guest.update({
        where: { id: guestId },
        data: { noAllergy: input.allergies.length === 0 && input.noAllergy },
      });
    });
  }

  /** Stores the plate with the engine's decision and the changes for the ticket, in one transaction. */
  createOrder(
    ctx: TenantContext,
    locationId: string,
    tableId: string,
    seat: number,
    dish: { id: string; course: number },
    assessment: Assessment,
    input: unknown,
    userId: string,
  ): Promise<string> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const guestId = await ensureGuest(tx, locationId, tableId, seat, userId);
      const guest = await tx.guest.findUniqueOrThrow({ where: { id: guestId } });
      const plate = await tx.plateOrder.create({
        data: {
          locationId,
          visitId: guest.visitId,
          guestId,
          dishId: dish.id,
          course: dish.course,
          status: 'ASSESSED',
          qrToken: randomBytes(12).toString('base64url'),
        },
      });
      await tx.assessment.create({
        data: {
          plateId: plate.id,
          locationId,
          outcome: assessment.outcome,
          reasons: assessment.reasons as unknown as Prisma.InputJsonValue,
          input: input as Prisma.InputJsonValue,
          engineVersion: assessment.engineVersion,
          inputHash: assessment.inputHash,
        },
      });
      if (assessment.modifications.length > 0) {
        await tx.plateModification.createMany({
          data: assessment.modifications.map((m) => ({
            plateId: plate.id,
            locationId,
            componentId: m.componentId,
            action: m.action,
            substituteId: m.substitute?.id ?? null,
            reasonAllergens: [...m.reasonAllergens, ...m.reasonIngredients],
          })),
        });
      }
      return plate.id;
    });
  }

  /** Takes a plate off the order. Only before the kitchen has started on it. */
  cancelOrder(ctx: TenantContext, plateId: string): Promise<boolean> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const { count } = await tx.plateOrder.updateMany({
        where: { id: plateId, status: 'ASSESSED' },
        data: { status: 'CANCELLED' },
      });
      return count === 1;
    });
  }

  dishCourse(ctx: TenantContext, dishId: string) {
    return this.prisma.forTenant(ctx, (tx) =>
      tx.dish.findUnique({ where: { id: dishId }, select: { id: true, course: true } }),
    );
  }

  /** Ingredient ids that exist for this organization, to validate picked ingredient allergies. */
  knownIngredientIds(ctx: TenantContext, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return Promise.resolve(new Set());
    return this.prisma.forTenant(ctx, async (tx) => {
      const rows = await tx.ingredient.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      return new Set(rows.map((r) => r.id));
    });
  }
}

async function loadTables(tx: TenantTx, locationId: string, label?: string): Promise<TableRow[]> {
  const points = await tx.servicePoint.findMany({
    where: { locationId, active: true, ...(label !== undefined ? { label } : {}) },
    include: {
      visits: {
        where: { closedAt: null },
        orderBy: { openedAt: 'desc' },
        take: 1,
        include: { guests: { include: guestInclude, orderBy: { seat: 'asc' } } },
      },
    },
  });
  return points
    .map((p) => {
      const visit = p.visits[0];
      return {
        id: p.id,
        label: p.label,
        seats: p.seats,
        shape: p.shape,
        floorId: p.floorId,
        visitId: visit?.id ?? null,
        bySeat: visit?.guests.map(toSeat) ?? [],
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

async function ensureGuest(
  tx: TenantTx,
  locationId: string,
  servicePointId: string,
  seat: number,
  userId: string,
): Promise<string> {
  const open = await tx.visit.findFirst({
    where: { servicePointId, closedAt: null },
    orderBy: { openedAt: 'desc' },
  });
  const visit =
    open ?? (await tx.visit.create({ data: { locationId, servicePointId, openedById: userId } }));
  const guest = await tx.guest.upsert({
    where: { visitId_seat: { visitId: visit.id, seat } },
    update: {},
    create: { visitId: visit.id, locationId, seat },
  });
  return guest.id;
}
