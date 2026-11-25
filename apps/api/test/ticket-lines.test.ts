import type { KitchenTicketResponse } from '@plateguard/contracts';
import { describe, expect, it } from 'vitest';
import { ticketLines } from '../src/modules/print/ticket-lines.js';

const ticket: KitchenTicketResponse = {
  plateId: 'p1',
  table: '7',
  seat: 3,
  course: 1,
  dishName: 'Toast',
  orderedAt: new Date(0).toISOString(),
  status: 'ASSESSED',
  outcome: 'DO_NOT_SERVE',
  block: 'DO_NOT_SERVE',
  allergies: [],
  checklist: [],
  qrToken: 'abcdefghijkl',
  waiterNote: null,
  overridable: true,
  override: null,
};
const text = {
  t: (key: string, values?: Record<string, unknown>) =>
    values?.note !== undefined ? `${key}: ${String(values.note)}` : key,
  names: new Map<string, string>(),
  locale: 'nl',
  reprint: false,
};

describe('ticketLines', () => {
  it('prints the waiter note under the dish when there is one', () => {
    const lines = ticketLines({ ...ticket, waiterNote: 'Guest asked for it' }, text);
    const dish = lines.findIndex((l) => l.kind === 'text' && l.text === 'Toast');
    expect(lines[dish + 1]).toEqual({
      kind: 'text',
      text: 'kitchen:waiterNote: Guest asked for it',
    });
    expect(lines[dish + 2]).toEqual({ kind: 'rule' });
  });

  it('prints no note line without one', () => {
    const lines = ticketLines(ticket, text);
    expect(lines.some((l) => 'text' in l && l.text.startsWith('kitchen:waiterNote'))).toBe(false);
  });
});
