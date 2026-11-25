import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  IncidentDetail,
  IncidentFollowUp,
  IncidentReport,
  IncidentSnapshot,
  IncidentSummary,
} from '@plateguard/contracts';
import { audit, type Prisma, type TenantTx } from '@plateguard/db';
import { PrismaService } from '../../common/prisma.service.js';
import type { TenantContext } from '../auth/permissions.js';

type Row = Prisma.IncidentGetPayload<object>;

/**
 * Incidents and the facts frozen with them. The snapshot is built in the same transaction as the
 * report, from the plate, its assessment, its checks and the audit trail of the seat.
 */
@Injectable()
export class IncidentRepository {
  constructor(private readonly prisma: PrismaService) {}

  report(
    ctx: TenantContext,
    locationId: string,
    tableLabel: string,
    input: IncidentReport,
    userId: string,
  ): Promise<string> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const point = await tx.servicePoint.findFirst({ where: { locationId, label: tableLabel } });
      if (!point) throw new NotFoundException({ code: 'TABLE_NOT_FOUND' });
      const plate = input.plateId
        ? await tx.plateOrder.findFirst({
            where: { id: input.plateId, locationId, visit: { servicePointId: point.id } },
            include: { guest: true },
          })
        : null;
      if (input.plateId && !plate) throw new NotFoundException({ code: 'PLATE_NOT_FOUND' });
      // The plate's visit, else the table's open one, else the last one: the report is often late.
      const visit = plate
        ? { id: plate.visitId }
        : await tx.visit.findFirst({
            where: { servicePointId: point.id },
            orderBy: [{ closedAt: { sort: 'desc', nulls: 'first' } }, { openedAt: 'desc' }],
            select: { id: true },
          });
      const seat = plate?.guest.seat ?? input.seat ?? null;
      if (seat !== null && seat > point.seats)
        throw new BadRequestException({ code: 'SEAT_NOT_AT_TABLE' });
      const guest =
        visit && seat !== null
          ? await tx.guest.findUnique({ where: { visitId_seat: { visitId: visit.id, seat } } })
          : null;
      const snapshot = await buildSnapshot(tx, guest?.id ?? null, plate?.id ?? null);
      const row = await tx.incident.create({
        data: {
          locationId,
          visitId: visit?.id ?? null,
          plateId: plate?.id ?? null,
          tableLabel: point.label,
          seat,
          kind: input.kind,
          severity: input.severity,
          description: input.description,
          reportedById: userId,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      // Guest data of this visit is kept past the 24 hour anonymization, for the follow-up.
      if (visit)
        await tx.visit.update({ where: { id: visit.id }, data: { anonymizeFrozen: true } });
      await audit(tx, ctx, {
        locationId,
        type: 'incident.reported',
        entity: 'incident',
        entityId: row.id,
        payload: { kind: input.kind, severity: input.severity, plateId: plate?.id ?? null, seat },
      });
      return row.id;
    });
  }

  locationName(ctx: TenantContext, locationId: string): Promise<string> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const l = await tx.location.findUnique({ where: { id: locationId }, select: { name: true } });
      return l?.name ?? '';
    });
  }

  /** Allergen names in one language, for showing the allergen codes in the snapshot. */
  allergenNames(ctx: TenantContext, locale: string): Promise<Map<string, string>> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const rows = await tx.allergenTranslation.findMany({
        where: { locale },
        select: { allergenCode: true, name: true },
      });
      return new Map(rows.map((r) => [r.allergenCode, r.name]));
    });
  }

  list(ctx: TenantContext, locationId: string): Promise<IncidentSummary[]> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const rows = await tx.incident.findMany({
        where: { locationId },
        orderBy: { reportedAt: 'desc' },
        take: 200,
      });
      const names = await userNames(
        tx,
        rows.map((r) => r.reportedById),
      );
      return rows.map((r) => summary(r, names));
    });
  }

  get(ctx: TenantContext, locationId: string, id: string): Promise<IncidentDetail> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const r = await tx.incident.findFirst({ where: { id, locationId } });
      if (!r) throw new NotFoundException({ code: 'INCIDENT_NOT_FOUND' });
      const names = await userNames(tx, [r.reportedById, r.closedById]);
      return {
        ...summary(r, names),
        description: r.description,
        cause: r.cause,
        measure: r.measure,
        closedAt: r.closedAt?.toISOString() ?? null,
        closedBy: r.closedById ? (names.get(r.closedById) ?? '') : null,
        snapshot: r.snapshot as unknown as IncidentSnapshot,
      };
    });
  }

  followUp(
    ctx: TenantContext,
    locationId: string,
    id: string,
    input: IncidentFollowUp,
    userId: string,
  ): Promise<void> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const r = await tx.incident.findFirst({ where: { id, locationId } });
      if (!r) throw new NotFoundException({ code: 'INCIDENT_NOT_FOUND' });
      if (input.close && (!input.cause || !input.measure))
        throw new BadRequestException({ code: 'INCIDENT_FOLLOW_UP_INCOMPLETE' });
      await tx.incident.update({
        where: { id },
        data: {
          cause: input.cause || null,
          measure: input.measure || null,
          ...(input.close
            ? { status: 'CLOSED', closedById: userId, closedAt: new Date() }
            : { status: 'OPEN', closedById: null, closedAt: null }),
        },
      });
      await audit(tx, ctx, {
        locationId,
        type: input.close ? 'incident.closed' : 'incident.updated',
        entity: 'incident',
        entityId: id,
        payload: { cause: input.cause, measure: input.measure },
      });
    });
  }
}

function summary(r: Row, names: Map<string, string>): IncidentSummary {
  const snap = r.snapshot as unknown as IncidentSnapshot;
  return {
    id: r.id,
    reportedAt: r.reportedAt.toISOString(),
    table: r.tableLabel,
    seat: r.seat,
    kind: r.kind,
    severity: r.severity,
    status: r.status,
    dishName: snap.plate?.dishName ?? null,
    reportedBy: names.get(r.reportedById) ?? '',
  };
}

async function userNames(tx: TenantTx, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (wanted.length === 0) return new Map();
  const users = await tx.user.findMany({
    where: { id: { in: wanted } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** What is known now about the seat and the plate, in plain values that will not change. */
async function buildSnapshot(
  tx: TenantTx,
  guestId: string | null,
  plateId: string | null,
): Promise<IncidentSnapshot> {
  const [allergies, plate, events] = await Promise.all([
    guestId
      ? tx.guestAllergy.findMany({
          where: { guestId },
          include: { ingredient: { select: { name: true } } },
        })
      : [],
    plateId
      ? tx.plateOrder.findUnique({
          where: { id: plateId },
          include: { assessment: true, modifications: true, checks: { orderBy: { at: 'asc' } } },
        })
      : null,
    tx.auditEvent.findMany({
      where: { entityId: { in: [guestId, plateId].filter((x): x is string => !!x) } },
      orderBy: { at: 'asc' },
      take: 200,
    }),
  ]);
  const [dish, components] = await Promise.all([
    plate?.dishId
      ? tx.dish.findUnique({ where: { id: plate.dishId }, select: { name: true } })
      : null,
    plate
      ? tx.component.findMany({
          where: {
            id: {
              in: plate.modifications.flatMap((m) =>
                m.substituteId ? [m.componentId, m.substituteId] : [m.componentId],
              ),
            },
          },
          select: { id: true, name: true },
        })
      : [],
  ]);
  const componentName = new Map(components.map((c) => [c.id, c.name]));
  const names = await userNames(tx, [
    ...events.map((e) => e.actorId),
    ...(plate?.checks.map((c) => c.byUserId) ?? []),
  ]);
  return {
    allergies: allergies.map((a) => ({
      label: a.allergenCode ?? a.ingredient?.name ?? a.customLabel ?? '',
      severity: a.severity,
    })),
    plate: plate
      ? {
          dishName: dish?.name ?? '',
          status: plate.status,
          course: plate.course,
          orderedAt: plate.createdAt.toISOString(),
          outcome: plate.assessment?.outcome ?? 'UNKNOWN',
          reasons: plate.assessment?.reasons ?? null,
          engineVersion: plate.assessment?.engineVersion ?? null,
          menuVersionId: plate.menuVersionId ?? plate.assessment?.menuVersionId ?? null,
          modifications: plate.modifications.map((m) => ({
            action: m.action,
            component: componentName.get(m.componentId) ?? m.componentId,
            substitute: m.substituteId
              ? (componentName.get(m.substituteId) ?? m.substituteId)
              : null,
          })),
          rejectReason: plate.rejectReason,
        }
      : null,
    checks: (plate?.checks ?? []).map((c) => ({
      kind: c.kind,
      by: names.get(c.byUserId) ?? '',
      at: c.at.toISOString(),
    })),
    timeline: events.map((e) => ({
      at: e.at.toISOString(),
      type: e.type,
      by: e.actorId ? (names.get(e.actorId) ?? '') : null,
    })),
  };
}
