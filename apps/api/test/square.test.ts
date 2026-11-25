import { describe, expect, it } from 'vitest';
import { SquarePosAdapter } from '../src/integrations/adapters/square/square-pos.adapter.js';
import {
  seatOf,
  tableOf,
  toCanonicalOrder,
} from '../src/integrations/adapters/square/square-order.js';
import {
  squareSignature,
  verifySquareSignature,
} from '../src/integrations/adapters/square/square-webhook.js';
import type { Connection } from '../src/integrations/core/ports.js';
import { openSecrets, sealSecrets, secretKey } from '../src/integrations/core/secrets.js';
import { fakeSquare } from './fake-square.js';

describe('Square orders in PlateGuard terms', () => {
  it('finds the table in metadata, ticket name or reference', () => {
    expect(tableOf({ id: 'o', metadata: { table: '12' } })).toBe('12');
    expect(tableOf({ id: 'o', ticket_name: 'Tafel 7' })).toBe('7');
    expect(tableOf({ id: 'o', reference_id: 'Table 3A' })).toBe('3A');
    expect(tableOf({ id: 'o', reference_id: 'T12' })).toBe('12');
    expect(tableOf({ id: 'o' })).toBeUndefined();
  });

  it('finds the seat in metadata or the line note', () => {
    expect(seatOf({ metadata: { seat: '2' } })).toBe(2);
    expect(seatOf({ note: 'stoel 3, geen ui' })).toBe(3);
    expect(seatOf({ note: 'Seat:4' })).toBe(4);
    expect(seatOf({ note: 'S1' })).toBe(1);
    expect(seatOf({ note: 'extra saus' })).toBeUndefined();
  });

  it('turns an order into a canonical order; custom amounts are left out', () => {
    const order = toCanonicalOrder({
      id: 'O1',
      state: 'OPEN',
      metadata: { table: '12' },
      created_at: '2026-11-25T18:00:00.123Z',
      line_items: [
        { uid: 'L1', name: 'Steak', catalog_object_id: 'V1', quantity: '2', note: 'stoel 1' },
        { uid: 'L2', name: 'Tip', quantity: '1' },
      ],
    });
    expect(order).toMatchObject({
      externalOrderId: 'O1',
      externalTableRef: '12',
      status: 'OPEN',
      lines: [{ externalLineId: 'L1', externalItemId: 'V1', quantity: 2, seat: 1 }],
    });
    expect(toCanonicalOrder({ id: 'O2', state: 'CANCELED' }).status).toBe('CANCELLED');
  });
});

describe('Square webhook signature', () => {
  const url = 'https://plateguard.example/hooks/square/abc';
  const body = Buffer.from('{"event_id":"e1"}');

  it('accepts the signature over URL and body, and nothing else', () => {
    const sig = squareSignature('key-123456', url, body);
    expect(verifySquareSignature('key-123456', url, body, sig)).toBe(true);
    expect(verifySquareSignature('key-123456', `${url}/`, body, sig)).toBe(false);
    expect(verifySquareSignature('other-key', url, body, sig)).toBe(false);
    expect(verifySquareSignature('key-123456', url, Buffer.from('{}'), sig)).toBe(false);
    expect(verifySquareSignature('key-123456', url, body, undefined)).toBe(false);
  });

  it('reads the order id from an order event', () => {
    const adapter = new SquarePosAdapter();
    const req = (event: unknown) => ({ headers: {}, body: Buffer.from(JSON.stringify(event)) });
    expect(
      adapter.parseWebhook(
        req({
          event_id: 'e1',
          type: 'order.updated',
          data: { type: 'order_updated', id: 'O9', object: { order_updated: { order_id: 'O9' } } },
        }),
      ),
    ).toEqual([{ idempotencyKey: 'e1', type: 'order.updated', externalOrderId: 'O9' }]);
    expect(adapter.parseWebhook(req({ event_id: 'e2', type: 'payment.created' }))).toEqual([]);
    expect(adapter.parseWebhook({ headers: {}, body: Buffer.from('not json') })).toEqual([]);
  });
});

describe('Square adapter against a fake Square', () => {
  const square = fakeSquare();
  const adapter = new SquarePosAdapter(square.http);
  const conn = (secrets: Record<string, string> = { accessToken: square.token }): Connection => ({
    id: 'c1',
    locationId: 'l1',
    provider: 'square',
    config: { squareLocationId: square.locationId, environment: 'sandbox', currency: 'EUR' },
    secrets,
  });

  it('checks the token and the location when connecting', async () => {
    expect(await adapter.connect(conn())).toEqual({
      ok: true,
      info: { locationName: 'Sandbox Bistro', currency: 'EUR' },
    });
    expect(await adapter.connect(conn({ accessToken: 'wrong' }))).toMatchObject({
      ok: false,
      error: 'TOKEN_INVALID',
    });
    const elsewhere = { ...conn(), config: { squareLocationId: 'NOPE' } };
    expect(await adapter.connect(elsewhere)).toMatchObject({ error: 'LOCATION_NOT_FOUND' });
    expect(square.calls[0]).toBe('GET /v2/locations/LOC1');
  });

  it('fills the catalog, rings up an order and reads it back', async () => {
    const ids = await adapter.pushMenu(conn(), [{ key: 'd1', name: 'Salad' }]);
    const variation = ids.get('d1')!;
    expect(await adapter.listMenuItems(conn())).toEqual([{ externalId: variation, name: 'Salad' }]);
    const id = await adapter.placeOrder(conn(), {
      table: '12',
      lines: [{ externalItemId: variation, seat: 2 }],
    });
    expect(await adapter.getOrder(conn(), id)).toMatchObject({
      externalTableRef: '12',
      lines: [{ externalItemId: variation, seat: 2, quantity: 1 }],
    });
    expect(await adapter.getOrder(conn(), 'missing')).toBeNull();
    expect((await adapter.pullOrders(conn(), new Date(0))).map((o) => o.externalOrderId)).toContain(
      id,
    );
  });
});

describe('connection secrets', () => {
  const key = secretKey('a-long-random-secret-for-tests-only-0123456789')!;

  it('round-trips, and cannot be read with another key or when tampered', () => {
    const sealed = sealSecrets({ accessToken: 'tok' }, key);
    expect(Buffer.from(sealed).toString('utf8')).not.toContain('tok');
    expect(openSecrets(sealed, key)).toEqual({ accessToken: 'tok' });
    expect(openSecrets(sealed, secretKey('another-long-random-secret-0123456789abcd'))).toEqual({});
    const tampered = Uint8Array.from(sealed);
    tampered[tampered.length - 1]! ^= 1;
    expect(openSecrets(tampered, key)).toEqual({});
  });

  it('needs a key of real length', () => {
    expect(secretKey('short')).toBeNull();
    expect(() => sealSecrets({}, null)).toThrow(/INTEGRATION_SECRET_KEY/);
  });
});
