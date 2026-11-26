import { describe, expect, it } from 'vitest';
import { LightspeedKAdapter } from '../src/integrations/adapters/lightspeed-k/lightspeed-k.adapter.js';
import { toCanonicalOrder as lightspeedOrder } from '../src/integrations/adapters/lightspeed-k/lightspeed-order.js';
import { MplusAdapter, mplusSignature } from '../src/integrations/adapters/mplus/mplus.adapter.js';
import type { Connection } from '../src/integrations/core/ports.js';
import { lineAllergies } from '../src/modules/pos/pos-allergies.js';

/** An open check as the K-Series spec's examples show it, with buttons on the lines. */
const check = {
  uuid: 'acc-uuid',
  ikaccountId: 'A17700.3',
  tableNumber: 3,
  openDate: '2026-11-26T13:24:49.265+0000',
  salesEntries: [
    {
      uuid: 'line-1',
      itemName: 'Satay',
      itemSku: 'SKU-SATAY',
      quantity: 2,
      modifiers: [{ instruction: 'Stoel 2' }, { instruction: 'Allergie: noten' }],
    },
    { id: 7, itemName: 'Water', itemSku: 'SKU-WATER', quantity: '1', modifiers: ['Stoel 1'] },
    { uuid: 'void', itemName: 'Wrong', itemSku: 'SKU-X', quantity: 1, active: false },
  ],
};

describe('Lightspeed K-Series', () => {
  it('reads table, lines, the seat button and the allergy button of an open check', () => {
    const o = lightspeedOrder(check)!;
    expect(o).toMatchObject({
      externalOrderId: 'A17700.3',
      externalTableRef: '3',
      openedAt: '2026-11-26T13:24:49.265Z',
      status: 'OPEN',
    });
    expect(o.lines.map((l) => [l.externalLineId, l.externalItemId, l.quantity, l.seat])).toEqual([
      ['line-1', 'SKU-SATAY', 2, 2],
      ['7', 'SKU-WATER', 1, 1],
    ]);
    expect(lineAllergies(o.lines[0]!, {})).toEqual([{ allergen: 'NUTS' }]);
  });

  it('pulls the open checks and lists the production instructions', async () => {
    const calls: string[] = [];
    const http = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      calls.push(url.pathname + url.search);
      const body = url.pathname.endsWith('/getCheck')
        ? [check]
        : [
            {
              productionInstructionGroupName: 'Allergie',
              productionInstructionList: [
                { instruction: 'Allergie: melk', ikentooModifierId: 1 },
                { instruction: 'Allergie: noten', ikentooModifierId: 2 },
              ],
            },
          ];
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    const conn: Connection = {
      id: 'c',
      locationId: 'l',
      provider: 'lightspeed-k',
      config: { businessLocationId: 4242 },
      secrets: { accessToken: 't' },
    };
    const ls = new LightspeedKAdapter(http);
    expect((await ls.pullOrders(conn)).length).toBe(1);
    expect(await ls.listModifiers(conn)).toEqual(['Allergie: melk', 'Allergie: noten']);
    expect(await ls.connect(conn)).toMatchObject({ ok: true });
    expect(calls[0]).toBe('/o/op/1/order/table/getCheck?businessLocationId=4242');
  });
});

describe('MplusKASSA', () => {
  const secret = Buffer.from('mplus-test-secret').toString('base64');
  const conn: Connection = {
    id: 'c',
    locationId: 'l',
    provider: 'mplus',
    config: {},
    secrets: { webhookSecret: secret },
  };
  const body = Buffer.from(
    JSON.stringify({
      session: {
        sessionId: 'S-1',
        table: { number: 12 },
        lines: [
          {
            lineId: 'L1',
            articleNumber: 1001,
            text: 'Pad thai',
            quantity: 1,
            preparationMethods: [{ text: 'Stoel 3' }, { text: 'geen pinda' }],
          },
        ],
      },
    }),
  );

  it('accepts only a body signed with the Base64-decoded key', () => {
    const mplus = new MplusAdapter();
    const signed = { headers: { 'x-mplus-signature': mplusSignature(secret, body) }, body };
    expect(mplus.verifyWebhook(signed, conn)).toBe(true);
    expect(mplus.verifyWebhook({ ...signed, body: Buffer.from('{}') }, conn)).toBe(false);
    expect(mplus.verifyWebhook({ headers: {}, body }, conn)).toBe(false);
  });

  it('turns a session event into the whole order, and a completed one into a closed order', () => {
    const mplus = new MplusAdapter();
    const [e] = mplus.parseWebhook({ headers: { 'x-plateguard-event': 'addSessionLine' }, body });
    expect(e!.order).toMatchObject({ externalOrderId: 'S-1', externalTableRef: '12' });
    const line = e!.order!.lines[0]!;
    expect([line.externalItemId, line.seat]).toEqual(['1001', 3]);
    expect(lineAllergies(line, {})).toEqual([{ allergen: 'PEANUTS' }]);
    const [done] = mplus.parseWebhook({
      headers: { 'x-plateguard-event': 'completeSession' },
      body,
    });
    expect(done!.order!.status).toBe('CLOSED');
    // The same body for another event is another message.
    expect(done!.idempotencyKey).not.toBe(e!.idempotencyKey);
  });
});
