/**
 * Square orders in PlateGuard's terms. Square has no tables or seats, so the till puts them in
 * the order: the table in the order's metadata ("table") or its ticket name or reference
 * ("Tafel 12", "Table 12", "T12", "12"); the seat per line in its metadata ("seat") or its note
 * ("stoel 2", "seat 2", "S2"); the course optionally in the line's metadata ("course").
 */
import type { CanonicalOrder } from '@plateguard/contracts';

export interface SquareLineItem {
  uid?: string;
  name?: string;
  variation_name?: string;
  quantity?: string;
  catalog_object_id?: string;
  note?: string;
  metadata?: Record<string, string>;
  modifiers?: { name?: string }[];
}

export interface SquareOrder {
  id: string;
  location_id?: string;
  state?: 'OPEN' | 'COMPLETED' | 'CANCELED' | 'DRAFT';
  reference_id?: string;
  ticket_name?: string;
  metadata?: Record<string, string>;
  created_at?: string;
  line_items?: SquareLineItem[];
}

const TABLE_WORDS = /^(?:tafel|table|tbl|t)\s*[:#.-]?\s*/i;
const SEAT_IN_TEXT = /(?:^|\b)(?:stoel|seat|s)\s*[:#.-]?\s*(\d{1,2})\b/i;

/** "Tafel 12" → "12". Empty text gives undefined. */
export function tableOf(order: SquareOrder): string | undefined {
  for (const raw of [order.metadata?.table, order.ticket_name, order.reference_id]) {
    const label = raw?.trim().replace(TABLE_WORDS, '').trim();
    if (label) return label;
  }
  return undefined;
}

export function seatOf(line: SquareLineItem): number | undefined {
  const fromMeta = Number(line.metadata?.seat);
  if (Number.isInteger(fromMeta) && fromMeta > 0) return fromMeta;
  const m = line.note?.match(SEAT_IN_TEXT);
  return m ? Number(m[1]) : undefined;
}

function courseOf(line: SquareLineItem): number | undefined {
  const c = Number(line.metadata?.course);
  return Number.isInteger(c) && c >= 0 ? c : undefined;
}

/** Square's times have milliseconds and a Z; anything else is replaced by now. */
function isoOrNow(value: string | undefined): string {
  const d = value ? new Date(value) : new Date();
  return (Number.isNaN(d.getTime()) ? new Date() : d).toISOString();
}

export function toCanonicalOrder(order: SquareOrder): CanonicalOrder {
  const table = tableOf(order);
  const seat = (l: SquareLineItem) => seatOf(l);
  return {
    externalOrderId: order.id,
    ...(table ? { externalTableRef: table } : {}),
    openedAt: isoOrNow(order.created_at),
    status:
      order.state === 'COMPLETED' ? 'CLOSED' : order.state === 'CANCELED' ? 'CANCELLED' : 'OPEN',
    lines: (order.line_items ?? []).flatMap((l, i) => {
      const quantity = Math.floor(Number(l.quantity ?? '1'));
      // Custom amounts have no catalog item: nothing to map to a dish.
      if (!l.catalog_object_id || !(quantity > 0)) return [];
      const s = seat(l);
      const c = courseOf(l);
      return [
        {
          externalLineId: l.uid ?? `${order.id}:${i}`,
          externalItemId: l.catalog_object_id,
          name: [l.name, l.variation_name].filter(Boolean).join(' · ') || l.catalog_object_id,
          quantity,
          ...(s !== undefined ? { seat: s } : {}),
          ...(c !== undefined ? { course: c } : {}),
          modifiers: (l.modifiers ?? []).flatMap((m) => (m.name ? [m.name] : [])),
        },
      ];
    }),
  };
}
