/**
 * Lightspeed Restaurant K-Series open checks in PlateGuard's terms.
 *
 * Field names come from the examples in the K-Series OpenAPI spec (api-docs.lsk.lightspeed.app):
 * an account snapshot with tableNumber, openDate and salesEntries; a line with uuid or id,
 * itemSku, itemName, quantity and modifiers. The spec's examples leave modifiers empty, so a
 * modifier is read as a plain name or as an object with one of the usual name fields.
 * shortcut: unverified against a live K-Series account, check with the demo account first.
 *
 * K-Series has no seat in its data. A restaurant gives seats a production-instruction group
 * ("Stoel 1" … "Stoel 8"); the seat is read from those buttons, like a note on a Square line.
 */
import type { CanonicalOrder } from '@plateguard/contracts';
import { seatInText, tableInText } from '../../core/pos-text.js';

type LsModifier = string | Record<string, unknown>;

export interface LsSalesEntry {
  id?: string | number;
  uuid?: string;
  itemName?: string;
  itemSku?: string;
  quantity?: number | string;
  modifiers?: LsModifier[];
  subLineItems?: LsSalesEntry[];
  active?: boolean;
}

export interface LsAccount {
  uuid?: string;
  ikaccountId?: string;
  identifier?: string;
  tableNumber?: number | string;
  name?: string;
  openDate?: string;
  closeDate?: string;
  salesEntries?: LsSalesEntry[];
}

const NAME_FIELDS = ['name', 'instruction', 'modifierName', 'productionInstructionName', 'text'];

export function modifierName(m: LsModifier): string | undefined {
  if (typeof m === 'string') return m.trim() || undefined;
  for (const f of NAME_FIELDS) {
    const v = m[f];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** Lightspeed writes "2021-12-21T13:24:49.265+0000"; anything unreadable becomes now. */
function iso(value: string | undefined): string {
  const d = value ? new Date(value.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) : new Date();
  return (Number.isNaN(d.getTime()) ? new Date() : d).toISOString();
}

export function accountId(a: LsAccount): string | undefined {
  return a.ikaccountId ?? a.identifier ?? a.uuid;
}

export function toCanonicalOrder(a: LsAccount): CanonicalOrder | null {
  const id = accountId(a);
  if (!id) return null;
  const table = tableInText(a.tableNumber === undefined ? a.name : String(a.tableNumber));
  return {
    externalOrderId: id,
    ...(table ? { externalTableRef: table } : {}),
    openedAt: iso(a.openDate),
    status: a.closeDate ? 'CLOSED' : 'OPEN',
    lines: (a.salesEntries ?? []).flatMap((l, i) => {
      const quantity = Math.floor(Number(l.quantity ?? 1));
      // A voided line stays on the check with active false.
      if (l.active === false || !l.itemSku || !(quantity > 0)) return [];
      const modifiers = [
        ...(l.modifiers ?? []),
        // Sub-items ("Fries" with a steak) carry no allergy button, but can carry a seat.
        ...(l.subLineItems ?? []).map((s) => s.itemName ?? ''),
      ].flatMap((m) => {
        const n = modifierName(m);
        return n ? [n] : [];
      });
      const seat = seatInText(...modifiers);
      return [
        {
          externalLineId: String(l.uuid ?? l.id ?? `${id}:${i}`),
          externalItemId: l.itemSku,
          name: l.itemName ?? l.itemSku,
          quantity,
          ...(seat !== undefined ? { seat } : {}),
          modifiers,
        },
      ];
    }),
  };
}
