import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { KitchenResponse, KitchenTicketResponse } from '@plateguard/contracts';
import {
  assess,
  kitchenBlock,
  kitchenChecklist,
  uncheckedItems,
  type ResolvedDish,
} from '@plateguard/domain';
import type { TenantContext } from '../auth/permissions.js';
import { MenuRepository } from '../service/menu.repository.js';
import {
  ServiceRepository,
  type OrderRow,
  type PlateStatus,
  type TableRow,
} from '../service/service.repository.js';

const TO_CHECK: PlateStatus[] = ['ASSESSED', 'IN_KITCHEN'];
const AT_PASS: PlateStatus[] = ['CHECKED', 'PASS_CHECKED'];

interface Plate {
  table: TableRow;
  seat: TableRow['bySeat'][number];
  order: OrderRow;
}

/**
 * The kitchen side of an allergy plate. The ticket is judged now, with the guest's current
 * allergies and the recipe from the menu version it was ordered from, so a late allergy change
 * reaches the kitchen. The cook confirms only with every risk point ticked, or rejects the plate
 * back to the waiter; then, optionally, a runner checks it at the pass before it is served.
 */
@Injectable()
export class KitchenService {
  constructor(
    private readonly service: ServiceRepository,
    private readonly menu: MenuRepository,
  ) {}

  async tickets(ctx: TenantContext, locationId: string, locale: string): Promise<KitchenResponse> {
    const [plates, passCheck, printers] = await Promise.all([
      this.plates(ctx, locationId),
      this.service.passCheck(ctx, locationId),
      this.service.printers(ctx, locationId),
    ]);
    const judge = await this.judge(ctx, locationId, locale, plates);
    const byAge = (a: KitchenTicketResponse, b: KitchenTicketResponse) =>
      a.orderedAt.localeCompare(b.orderedAt);
    const tickets = plates.flatMap((p) => {
      const t = judge(p);
      return t ? [t] : [];
    });
    return {
      queue: tickets.filter((t) => TO_CHECK.includes(t.status)).sort(byAge),
      ready: tickets.filter((t) => AT_PASS.includes(t.status)).sort(byAge),
      passCheck,
      printers,
    };
  }

  /** One plate's ticket as the kitchen sees it now, or null when the plate is no longer open. */
  async ticket(
    ctx: TenantContext,
    locationId: string,
    plateId: string,
    locale: string,
  ): Promise<KitchenTicketResponse | null> {
    const plate = await this.plate(ctx, locationId, plateId).catch(() => null);
    return plate ? (await this.judge(ctx, locationId, locale, [plate]))(plate) : null;
  }

  async check(
    ctx: TenantContext,
    locationId: string,
    plateId: string,
    checked: string[],
    locale: string,
  ): Promise<void> {
    const plate = await this.plate(ctx, locationId, plateId);
    // The same locale as the ticket the cook ticked, so the checklist ids match.
    const ticket = (await this.judge(ctx, locationId, locale, [plate]))(plate);
    if (!ticket) throw new NotFoundException({ code: 'PLATE_NOT_FOUND' });
    if (ticket.block) throw new ConflictException({ code: 'PLATE_BLOCKED', block: ticket.block });
    const missing = uncheckedItems(ticket.checklist, checked).map((i) => i.id);
    if (missing.length > 0)
      throw new BadRequestException({ code: 'CHECKLIST_INCOMPLETE', missing });
    await this.move(ctx, locationId, plateId, TO_CHECK, 'CHECKED', {
      type: 'plate.checked',
      check: 'KITCHEN',
      payload: { checked: ticket.checklist.map((i) => i.id), outcome: ticket.outcome },
    });
  }

  async reject(
    ctx: TenantContext,
    locationId: string,
    plateId: string,
    reason: string,
  ): Promise<void> {
    await this.plate(ctx, locationId, plateId);
    await this.move(ctx, locationId, plateId, [...TO_CHECK, ...AT_PASS], 'REJECTED', {
      type: 'plate.rejected',
      rejectReason: reason,
      payload: { reason },
    });
  }

  async passChecked(ctx: TenantContext, locationId: string, plateId: string): Promise<void> {
    await this.plate(ctx, locationId, plateId);
    await this.move(ctx, locationId, plateId, ['CHECKED'], 'PASS_CHECKED', {
      type: 'plate.pass_checked',
      check: 'PASS',
    });
  }

  /** With the pass check on, an allergy plate is served only after a runner checked it. */
  async serve(ctx: TenantContext, locationId: string, plateId: string): Promise<void> {
    const [plate, passCheck] = await Promise.all([
      this.plate(ctx, locationId, plateId),
      this.service.passCheck(ctx, locationId),
    ]);
    const from: PlateStatus[] =
      plate.seat.allergies.length === 0
        ? ['ASSESSED', 'IN_KITCHEN', 'CHECKED', 'PASS_CHECKED']
        : passCheck
          ? ['PASS_CHECKED']
          : AT_PASS;
    await this.move(ctx, locationId, plateId, from, 'SERVED', { type: 'plate.served' });
  }

  passCheck(ctx: TenantContext, locationId: string): Promise<boolean> {
    return this.service.passCheck(ctx, locationId);
  }

  setPassCheck(ctx: TenantContext, locationId: string, passCheck: boolean): Promise<void> {
    return this.service.setPassCheck(ctx, locationId, passCheck);
  }

  private async move(
    ctx: TenantContext,
    locationId: string,
    plateId: string,
    from: PlateStatus[],
    to: PlateStatus,
    e: Parameters<ServiceRepository['transition']>[5],
  ) {
    if (!(await this.service.transition(ctx, locationId, plateId, from, to, e)))
      throw new ConflictException({ code: 'PLATE_STATUS_CHANGED' });
  }

  /** Every allergy plate of the open visits. Plates for guests without allergies need no ticket. */
  private async plates(ctx: TenantContext, locationId: string): Promise<Plate[]> {
    const { tables } = await this.service.floors(ctx, locationId);
    return tables.flatMap((table) =>
      table.bySeat
        .filter((seat) => seat.allergies.length > 0)
        .flatMap((seat) => seat.orders.map((order) => ({ table, seat, order }))),
    );
  }

  private async plate(ctx: TenantContext, locationId: string, plateId: string): Promise<Plate> {
    const { tables } = await this.service.floors(ctx, locationId);
    for (const table of tables)
      for (const seat of table.bySeat) {
        const order = seat.orders.find((o) => o.id === plateId);
        if (order) return { table, seat, order };
      }
    throw new NotFoundException({ code: 'PLATE_NOT_FOUND' });
  }

  /** A function that turns a plate into its ticket, with the dishes it needs loaded once. */
  private async judge(
    ctx: TenantContext,
    locationId: string,
    locale: string,
    plates: Plate[],
  ): Promise<(p: Plate) => KitchenTicketResponse | null> {
    const versionIds = plates.flatMap((p) =>
      p.order.menuVersionId ? [p.order.menuVersionId] : [],
    );
    const [current, versions] = await Promise.all([
      this.menu.dishes(ctx, locationId, locale),
      this.menu.versions(ctx, versionIds, locale),
    ]);
    const byId = new Map(current.map((d) => [d.id, d]));
    const dishOf = (o: OrderRow): ResolvedDish | undefined =>
      (o.menuVersionId
        ? versions.get(o.menuVersionId)?.find((d) => d.id === o.dishId)
        : undefined) ?? byId.get(o.dishId);
    return ({ table, seat, order }) => {
      const dish = dishOf(order);
      if (!dish) return null;
      const result = assess({ dish, guest: seat.allergies });
      const block = kitchenBlock(result);
      return {
        plateId: order.id,
        table: table.label,
        seat: seat.seat,
        course: order.course,
        dishName: dish.name,
        orderedAt: order.createdAt.toISOString(),
        status: order.status,
        outcome: result.outcome,
        block,
        allergies: result.perAllergy.map((r) => ({
          allergen: r.allergen,
          ingredient: r.ingredient,
          custom: r.custom,
          severity: r.severity,
          outcome: r.outcome,
        })),
        checklist: block ? [] : kitchenChecklist(result),
        qrToken: order.qrToken,
      };
    };
  }
}
