import { assess } from './engine.js';
import type { Assessment, Choice, GuestAllergy, Outcome, ResolvedDish } from './types.js';

export type AlertKind = 'stop' | 'warn' | 'unknown';

export interface SeatOrders {
  table: string;
  seat: number;
  allergies: GuestAllergy[];
  /**
   * Open orders only: not served, rejected or cancelled. `dish` is the recipe as it was on the
   * menu when ordered; without it the dish is looked up in the current menu.
   */
  orders: { id: string; dishId: string; dish?: ResolvedDish; choices?: Choice[] }[];
}

export interface OrderAlert {
  /** The order line (plate) id. */
  id: string;
  kind: AlertKind;
  table: string;
  seat: number;
  dish: ResolvedDish;
  result: Assessment;
}

/** Outcomes that need someone's attention. "None found", with or without a note, never alerts. */
const KIND: Partial<Record<Outcome, AlertKind>> = {
  DO_NOT_SERVE: 'stop',
  UNKNOWN: 'unknown',
  CAUTION: 'warn',
  ADAPTABLE: 'warn',
};
const RANK: Record<AlertKind, number> = { stop: 0, unknown: 1, warn: 2 };

/**
 * Alerts come only from what a guest actually ordered: each open order is judged for the
 * seat's current allergies. The menu shows outcomes as guidance but never raises an alert.
 * Worst first, then by table and seat.
 */
export function orderAlerts(seats: SeatOrders[], dishes: ResolvedDish[]): OrderAlert[] {
  const byId = new Map(dishes.map((d) => [d.id, d]));
  const alerts: OrderAlert[] = [];
  for (const s of seats) {
    if (s.allergies.length === 0) continue;
    for (const order of s.orders) {
      const dish = order.dish ?? byId.get(order.dishId);
      if (!dish) continue;
      const result = assess({ dish, guest: s.allergies, choices: order.choices });
      const kind = KIND[result.outcome];
      if (kind) alerts.push({ id: order.id, kind, table: s.table, seat: s.seat, dish, result });
    }
  }
  return alerts.sort(
    (a, b) =>
      RANK[a.kind] - RANK[b.kind] ||
      a.table.localeCompare(b.table, undefined, { numeric: true }) ||
      a.seat - b.seat,
  );
}
