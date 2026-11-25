import { assess, type Assessment, type Outcome, type ResolvedDish } from '@plateguard/domain';
import type { ServiceState } from './state';

export type AlertKind = 'stop' | 'warn' | 'unknown' | 'missed';

export interface OrderAlert {
  id: string;
  kind: Exclude<AlertKind, 'missed'>;
  table: string;
  seat: number;
  dish: ResolvedDish;
  result: Assessment;
}

/** Outcomes that need someone's attention. "None found" (with or without a note) never alerts. */
const KIND: Partial<Record<Outcome, OrderAlert['kind']>> = {
  DO_NOT_SERVE: 'stop',
  UNKNOWN: 'unknown',
  CAUTION: 'warn',
  ADAPTABLE: 'warn',
};

const RANK: Record<OrderAlert['kind'], number> = { stop: 0, unknown: 1, warn: 2 };

/**
 * Alerts come only from what a guest actually ordered: each ordered dish is judged for the
 * allergies of that seat. The menu itself shows colours as guidance, but never raises an alert.
 */
export function orderAlerts(state: ServiceState, dishes: ResolvedDish[]): OrderAlert[] {
  const byId = new Map(dishes.map((d) => [d.id, d]));
  const alerts: OrderAlert[] = [];
  for (const [table, seats] of Object.entries(state)) {
    for (const [seatKey, seat] of Object.entries(seats)) {
      if (seat.allergies.length === 0) continue;
      seat.orders.forEach((order) => {
        const dish = byId.get(order.dishId);
        if (!dish) return;
        const result = assess({ dish, guest: seat.allergies });
        const kind = KIND[result.outcome];
        if (kind) alerts.push({ id: order.id, kind, table, seat: Number(seatKey), dish, result });
      });
    }
  }
  return alerts.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}
