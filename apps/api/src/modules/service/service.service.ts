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
  orderAlerts,
  type GuestAllergy,
  type ResolvedDish,
} from '@plateguard/domain';
import type { TenantContext } from '../auth/permissions.js';
import { MenuRepository } from './menu.repository.js';
import { ServiceRepository, type TableRow } from './service.repository.js';

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
    return { dishes, ingredients };
  }

  async floors(ctx: TenantContext, locationId: string): Promise<FloorResponse[]> {
    const [{ floors, tables }, dishes] = await Promise.all([
      this.service.floors(ctx, locationId),
      this.menu.dishes(ctx, locationId, 'en'),
    ]);
    const alerts = alertsFor(tables, dishes);
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
      bySeat: t.bySeat.map(({ guestId: _, ...seat }) => seat),
    };
  }

  async alerts(ctx: TenantContext, locationId: string, locale: string): Promise<AlertResponse[]> {
    const [{ tables }, dishes] = await Promise.all([
      this.service.floors(ctx, locationId),
      this.menu.dishes(ctx, locationId, locale),
    ]);
    return alertsFor(tables, dishes);
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
  ): Promise<TableResponse> {
    const t = await this.requireTable(ctx, locationId, label);
    if (seat > t.seats) throw new BadRequestException({ code: 'SEAT_NOT_AT_TABLE' });
    const [dishRow, dishes] = await Promise.all([
      this.service.dishCourse(ctx, dishId),
      this.menu.dishes(ctx, locationId, 'en'),
    ]);
    const dish = dishes.find((d) => d.id === dishId);
    if (!dishRow || !dish) throw new NotFoundException({ code: 'DISH_NOT_FOUND' });
    const guest = t.bySeat.find((s) => s.seat === seat)?.allergies ?? [];
    const input = { dish, guest };
    const result = assess(input);
    await this.service.createOrder(ctx, locationId, t.id, seat, dishRow, result, input, userId);
    return this.table(ctx, locationId, label);
  }

  async cancelOrder(
    ctx: TenantContext,
    locationId: string,
    label: string,
    plateId: string,
  ): Promise<TableResponse> {
    const t = await this.requireTable(ctx, locationId, label);
    const onTable = t.bySeat.some((s) => s.orders.some((o) => o.id === plateId));
    if (!onTable || !(await this.service.cancelOrder(ctx, plateId)))
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    return this.table(ctx, locationId, label);
  }

  private async requireTable(ctx: TenantContext, locationId: string, label: string) {
    const t = await this.service.table(ctx, locationId, label);
    if (!t) throw new NotFoundException({ code: 'TABLE_NOT_FOUND' });
    return t;
  }
}

/** The API shape of the domain's order alerts. */
export function alertsFor(tables: TableRow[], dishes: ResolvedDish[]): AlertResponse[] {
  const seats = tables.flatMap((t) => t.bySeat.map((s) => ({ ...s, table: t.label })));
  return orderAlerts(seats, dishes).map((a) => ({
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
  }));
}
