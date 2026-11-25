import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AlertResponse,
  FloorResponse,
  MenuResponse,
  SeatUpdate,
  TableResponse,
} from '@plateguard/contracts';
import {
  assess,
  normalizeLabel,
  type Choice,
  orderAlerts,
  type GuestAllergy,
  type ResolvedDish,
} from '@plateguard/domain';
import type { TenantContext } from '../auth/permissions.js';
import { MenuRepository } from './menu.repository.js';
import {
  OPEN_PLATE_STATUSES,
  ServiceRepository,
  type PlateStatus,
  type PosLineRef,
  type TableRow,
} from './service.repository.js';

const OPEN = new Set<PlateStatus>(OPEN_PLATE_STATUSES);

/** A plate's alert as it is now: a worse outcome, or the kitchen sending it back, is new. */
const alertKey = (a: AlertResponse) =>
  `${a.id}:${a.kind}:${a.result.outcome}:${a.rejected ? 'r' : ''}`;

const allergyKey = (a: GuestAllergy) =>
  a.allergen ?? (a.ingredient ? `i:${a.ingredient.id}` : `c:${normalizeLabel(a.custom ?? '')}`);

/**
 * Tables, seats and orders. Alerts are not stored: they follow from the open orders and the
 * seat's current allergies, judged by the same engine as the app, so they never drift apart.
 */
@Injectable()
export class ServiceService {
  constructor(
    private readonly service: ServiceRepository,
    private readonly menu: MenuRepository,
  ) {}

  async getMenu(ctx: TenantContext, locationId: string, locale: string): Promise<MenuResponse> {
    const [dishes, ingredients] = await Promise.all([
      this.menu.dishes(ctx, locationId, locale),
      this.menu.ingredients(ctx),
    ]);
    const placement = await this.menu.placement(
      ctx,
      dishes.map((d) => d.id),
    );
    return {
      dishes: dishes.map((d) => ({
        ...d,
        course: placement.get(d.id)?.course ?? 0,
        category: placement.get(d.id)?.category ?? null,
        subcategory: placement.get(d.id)?.subcategory ?? null,
      })),
      ingredients,
    };
  }

  async floors(ctx: TenantContext, locationId: string): Promise<FloorResponse[]> {
    const { floors, tables } = await this.service.floors(ctx, locationId);
    const alerts = await this.alertsOf(ctx, locationId, 'en', tables);
    return floors.map((f) => ({
      id: f.id,
      name: f.name,
      tables: tables
        .filter((t) => t.floorId === f.id)
        .map((t) => ({
          id: t.id,
          label: t.label,
          seats: t.seats,
          shape: t.shape,
          position: t.position,
          size: t.size,
          rotation: t.rotation,
          guests: t.bySeat.length,
          allergyGuests: t.bySeat.filter((s) => s.allergies.length > 0).length,
          openAlerts: alerts.filter((a) => a.table === t.label).length,
        })),
    }));
  }

  async table(ctx: TenantContext, locationId: string, label: string): Promise<TableResponse> {
    const t = await this.requireTable(ctx, locationId, label);
    return {
      id: t.id,
      label: t.label,
      seats: t.seats,
      visitId: t.visitId,
      bySeat: t.bySeat.map((s) => ({
        seat: s.seat,
        allergies: s.allergies,
        noAllergy: s.noAllergy,
        orders: s.orders.map((o) => ({
          id: o.id,
          dishId: o.dishId,
          outcome: o.outcome,
          status: o.status,
          ...(o.status === 'REJECTED' && o.rejectReason ? { rejectReason: o.rejectReason } : {}),
          ...(o.waiterNote ? { note: o.waiterNote } : {}),
          ...(o.override ? { approved: o.override.reason } : {}),
          ...(o.choices.length > 0 ? { choices: o.choices } : {}),
        })),
      })),
    };
  }

  /** The open alerts, each marked read or unread for this person. */
  async alerts(
    ctx: TenantContext,
    locationId: string,
    locale: string,
    userId: string,
  ): Promise<AlertResponse[]> {
    const { tables } = await this.service.floors(ctx, locationId);
    const alerts = await this.alertsOf(ctx, locationId, locale, tables);
    const read = await this.service.readAlertKeys(ctx, locationId, userId);
    return alerts.map((a) => ({ ...a, read: read.has(alertKey(a)) }));
  }

  /** Marks the given open alerts read for this person, or all of them without ids. */
  async markAlertsRead(
    ctx: TenantContext,
    locationId: string,
    locale: string,
    userId: string,
    ids?: string[],
  ): Promise<AlertResponse[]> {
    const { tables } = await this.service.floors(ctx, locationId);
    const alerts = await this.alertsOf(ctx, locationId, locale, tables);
    const pick = ids ? new Set(ids) : null;
    await this.service.markAlertsRead(
      ctx,
      locationId,
      userId,
      alerts.filter((a) => !pick || pick.has(a.id)).map(alertKey),
    );
    return this.alerts(ctx, locationId, locale, userId);
  }

  /** Each order is judged with the recipe from the menu version it was ordered from. */
  private async alertsOf(
    ctx: TenantContext,
    locationId: string,
    locale: string,
    tables: TableRow[],
  ): Promise<AlertResponse[]> {
    const versionIds = tables.flatMap((t) =>
      t.bySeat.flatMap((s) => s.orders.flatMap((o) => (o.menuVersionId ? [o.menuVersionId] : []))),
    );
    const [dishes, versions] = await Promise.all([
      this.menu.dishes(ctx, locationId, locale),
      this.menu.versions(ctx, versionIds, locale),
    ]);
    return alertsFor(tables, dishes, versions);
  }

  async saveSeat(
    ctx: TenantContext,
    locationId: string,
    label: string,
    seat: number,
    input: SeatUpdate,
    userId: string,
  ): Promise<TableResponse> {
    const t = await this.requireTable(ctx, locationId, label);
    if (seat > t.seats) throw new BadRequestException({ code: 'SEAT_NOT_AT_TABLE' });
    // One row per allergy: the last entry wins when the app sends the same allergy twice.
    const allergies = [
      ...new Map((input.allergies as GuestAllergy[]).map((a) => [allergyKey(a), a])).values(),
    ];
    const ingredientIds = allergies.flatMap((a) => (a.ingredient ? [a.ingredient.id] : []));
    const known = await this.service.knownIngredientIds(ctx, ingredientIds);
    if (ingredientIds.some((id) => !known.has(id)))
      throw new BadRequestException({ code: 'UNKNOWN_INGREDIENT' });
    await this.service.saveSeat(
      ctx,
      locationId,
      t.id,
      seat,
      { allergies, noAllergy: input.noAllergy },
      userId,
    );
    return this.table(ctx, locationId, label);
  }

  async order(
    ctx: TenantContext,
    locationId: string,
    label: string,
    seat: number,
    dishId: string,
    userId: string,
    note?: string,
    choices?: Choice[],
  ): Promise<TableResponse> {
    await this.place(ctx, locationId, label, seat, dishId, userId, undefined, note, choices);
    return this.table(ctx, locationId, label);
  }

  /**
   * Puts a plate on a seat, judged against the seat's allergies. With a POS line as ref, the
   * same line is placed only once: a second attempt answers null. A waiter who orders a dish
   * that must not be served to this guest has to say why; the note goes to the kitchen and the
   * audit trail. A POS line cannot, so it is placed and the kitchen blocks it as before.
   */
  async place(
    ctx: TenantContext,
    locationId: string,
    label: string,
    seat: number,
    dishId: string,
    userId: string,
    ref?: PosLineRef,
    note?: string,
    choices: Choice[] = [],
  ): Promise<string | null> {
    const t = await this.requireTable(ctx, locationId, label);
    if (seat > t.seats) throw new BadRequestException({ code: 'SEAT_NOT_AT_TABLE' });
    const [dishRow, menu] = await Promise.all([
      this.service.dishCourse(ctx, dishId),
      this.menu.current(ctx, locationId, 'en'),
    ]);
    // Only dishes on the published menu can be ordered.
    const dish = menu.dishes.find((d) => d.id === dishId);
    if (!dishRow || !dish) throw new NotFoundException({ code: 'DISH_NOT_FOUND' });
    const guest = t.bySeat.find((s) => s.seat === seat)?.allergies ?? [];
    const input = { dish, guest, ...(choices.length > 0 ? { choices } : {}) };
    const result = assess(input);
    if (!ref && result.outcome === 'DO_NOT_SERVE' && !note?.trim())
      throw new BadRequestException({ code: 'NOTE_REQUIRED' });
    return this.service.createOrder(
      ctx,
      locationId,
      t.id,
      seat,
      dishRow,
      result,
      input,
      userId,
      menu.versionId,
      ref,
      note?.trim(),
      choices,
    );
  }

  async cancelOrder(
    ctx: TenantContext,
    locationId: string,
    label: string,
    plateId: string,
  ): Promise<TableResponse> {
    const t = await this.requireTable(ctx, locationId, label);
    const onTable = t.bySeat.some((s) => s.orders.some((o) => o.id === plateId));
    if (!onTable || !(await this.service.cancelOrder(ctx, locationId, plateId)))
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    return this.table(ctx, locationId, label);
  }

  private async requireTable(ctx: TenantContext, locationId: string, label: string) {
    const t = await this.service.table(ctx, locationId, label);
    if (!t) throw new NotFoundException({ code: 'TABLE_NOT_FOUND' });
    return t;
  }
}

/**
 * The API shape of the domain's order alerts, for plates on their way to the guest. A plate the
 * kitchen sent back always alerts as a stop, with the cook's reason, until the waiter removes it.
 * A blocked plate the kitchen approved anyway no longer alerts: the table shows the approval.
 */
export function alertsFor(
  tables: TableRow[],
  dishes: ResolvedDish[],
  versions: Map<string, ResolvedDish[]> = new Map(),
): AlertResponse[] {
  const byId = new Map(dishes.map((d) => [d.id, d]));
  const dishOf = (o: TableRow['bySeat'][number]['orders'][number]) =>
    (o.menuVersionId ? versions.get(o.menuVersionId)?.find((d) => d.id === o.dishId) : undefined) ??
    byId.get(o.dishId);
  const seats = tables.flatMap((t) =>
    t.bySeat.map((s) => ({
      ...s,
      table: t.label,
      orders: s.orders
        .filter((o) => OPEN.has(o.status) && !o.override)
        .map((o) => ({ ...o, dish: dishOf(o) })),
    })),
  );
  const open: AlertResponse[] = orderAlerts(seats, dishes).map((a) => ({
    id: a.id,
    kind: a.kind,
    table: a.table,
    seat: a.seat,
    dishId: a.dish.id,
    dishName: a.dish.name,
    result: {
      outcome: a.result.outcome,
      modifications: a.result.modifications,
      manualChecks: a.result.manualChecks,
    },
    read: false,
  }));
  const rejected: AlertResponse[] = tables.flatMap((t) =>
    t.bySeat.flatMap((s) =>
      s.orders.flatMap((o) => {
        const dish = o.status === 'REJECTED' ? dishOf(o) : undefined;
        if (!dish) return [];
        const result = assess({ dish, guest: s.allergies, choices: o.choices });
        return [
          {
            id: o.id,
            kind: 'stop' as const,
            table: t.label,
            seat: s.seat,
            dishId: dish.id,
            dishName: dish.name,
            result: {
              outcome: result.outcome,
              modifications: result.modifications,
              manualChecks: result.manualChecks,
            },
            rejected: { reason: o.rejectReason ?? '' },
            read: false,
          },
        ];
      }),
    ),
  );
  return [...rejected, ...open];
}
