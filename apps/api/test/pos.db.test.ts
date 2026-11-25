/**
 * The Square test link against a migrated database and a fake Square: connecting stores the
 * token encrypted, the menu goes into the test POS, a test order becomes plates on the seats,
 * a webhook for the same order adds nothing twice, and lines that cannot be placed are counted.
 * Skipped without DATABASE_URL.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { SquarePosAdapter } from '../src/integrations/adapters/square/square-pos.adapter.js';
import { squareSignature } from '../src/integrations/adapters/square/square-webhook.js';
import { ConnectionsRepository } from '../src/integrations/core/connections.repository.js';
import { InboxDispatcher } from '../src/integrations/core/inbox-dispatcher.js';
import { InboxRepository } from '../src/integrations/core/inbox.repository.js';
import { AdapterRegistry } from '../src/integrations/core/registry.js';
import { HooksService } from '../src/integrations/hooks.service.js';
import { PosRepository } from '../src/modules/pos/pos.repository.js';
import { PosService } from '../src/modules/pos/pos.service.js';
import { MenuRepository } from '../src/modules/service/menu.repository.js';
import { ServiceRepository } from '../src/modules/service/service.repository.js';
import { ServiceService } from '../src/modules/service/service.service.js';
import { fakeSquare } from './fake-square.js';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('Square test link', () => {
  process.env.INTEGRATION_SECRET_KEY ??= 'test-integration-secret-key-0123456789abcdef';
  const prisma = new PrismaService();
  const db = prisma.system();
  const repo = new ServiceRepository(prisma);
  const menu = new MenuRepository(prisma);
  const service = new ServiceService(repo, menu);
  const square = fakeSquare();
  const registry = new AdapterRegistry().register(new SquarePosAdapter(square.http));
  const connections = new ConnectionsRepository(prisma);
  const inbox = new InboxRepository(prisma);
  const dispatcher = new InboxDispatcher();
  const pos = new PosService(
    new PosRepository(prisma),
    connections,
    inbox,
    dispatcher,
    registry,
    service,
    menu,
  );
  pos.onModuleInit();
  const hooks = new HooksService(registry, connections, inbox, dispatcher);
  const org = randomUUID();
  const loc: string = randomUUID();
  const user: string = randomUUID();
  const ctx = { organizationId: org, locationIds: [loc], userId: user };
  let salad = '';
  let soup = '';

  const code = (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: { response?: { code?: string } }) => e.response?.code,
    );
  const plates = async () =>
    (await service.table(ctx, loc, '7')).bySeat.flatMap((s) =>
      s.orders.map((o) => [s.seat, o.dishId === salad ? 'Salad' : 'Soup']),
    );

  beforeAll(async () => {
    await db.user.create({ data: { id: user, name: 'Test owner' } });
    await db.organization.create({ data: { id: org, name: 'Test', plan: 'test' } });
    await db.location.create({
      data: { id: loc, organizationId: org, name: 'T', slug: `pos-${loc}` },
    });
    const floor = await db.floor.create({ data: { locationId: loc, name: 'In', sortOrder: 0 } });
    await db.servicePoint.create({
      data: { locationId: loc, floorId: floor.id, label: '7', seats: 4, qrToken: `pos-${loc}` },
    });
    const verified = { verifiedAt: new Date(), verifiedSource: 'test' };
    const bread = await db.ingredient.create({
      data: { organizationId: org, name: 'Bread', contains: ['GLUTEN_WHEAT'], ...verified },
    });
    const leaf = await db.ingredient.create({
      data: { organizationId: org, name: 'Leaf', ...verified },
    });
    const dish = async (name: string, ingredientId: string) => {
      const c = await db.component.create({ data: { organizationId: org, name } });
      await db.componentIngredient.create({
        data: { organizationId: org, componentId: c.id, ingredientId },
      });
      const d = await db.dish.create({ data: { locationId: loc, name, course: 1 } });
      await db.dishComponent.create({ data: { locationId: loc, dishId: d.id, componentId: c.id } });
      return d.id;
    };
    salad = await dish('Salad', leaf.id);
    soup = await dish('Bread soup', bread.id);
    await service.saveSeat(
      ctx,
      loc,
      '7',
      2,
      { allergies: [{ allergen: 'GLUTEN', severity: 'ALLERGY' }], noAllergy: false },
      user,
    );
  });

  afterAll(() => prisma.onModuleDestroy());

  it('refuses a wrong token, and stores a right one only encrypted', async () => {
    expect(
      await code(
        pos.connect(ctx, loc, { accessToken: 'x'.repeat(30), squareLocationId: 'LOC1' }, user),
      ),
    ).toBe('POS_CONNECT_FAILED');
    const { connection } = await pos.connect(
      ctx,
      loc,
      { accessToken: square.token, squareLocationId: square.locationId },
      user,
    );
    expect(connection).toMatchObject({ locationName: 'Sandbox Bistro', sandbox: true });
    const row = await db.integrationConnection.findUniqueOrThrow({ where: { id: connection!.id } });
    expect(Buffer.from(row.encryptedSecrets!).toString('utf8')).not.toContain(square.token);
    expect(JSON.stringify(row.config)).not.toContain(square.token);
    expect(
      await code(
        pos.connect(ctx, loc, { accessToken: square.token, squareLocationId: 'LOC1' }, user),
      ),
    ).toBe('POS_ALREADY_CONNECTED');
  });

  it('puts the menu in the test POS, linked to the dishes', async () => {
    const { items } = await pos.pushMenu(ctx, loc);
    expect(items.map((i) => [i.name, i.dishId])).toEqual([
      ['Bread soup', soup],
      ['Salad', salad],
    ]);
    // Again: nothing new, every dish is linked already.
    expect((await pos.pushMenu(ctx, loc)).items).toHaveLength(2);
  });

  it('links an item that is already in the POS by name instead of making it again', async () => {
    const { items } = await pos.items(ctx, loc);
    const salads = items.filter((i) => i.name === 'Salad');
    await pos.map(ctx, loc, { externalItemId: salads[0]!.externalId, dishId: null });
    const after = await pos.pushMenu(ctx, loc);
    expect(after.items.filter((i) => i.name === 'Salad')).toEqual([
      { externalId: salads[0]!.externalId, name: 'Salad', dishId: salad },
    ]);
  });

  it('a test order becomes plates on the seats, judged against their allergies', async () => {
    const result = await pos.testOrder(ctx, loc, {
      table: '7',
      lines: [
        { dishId: salad, seat: 1 },
        { dishId: soup, seat: 2 },
      ],
    });
    expect(result).toMatchObject({ orders: 1, plates: 2, duplicates: 0 });
    expect(await plates()).toEqual([
      [1, 'Salad'],
      [2, 'Soup'],
    ]);
    const seat2 = (await service.table(ctx, loc, '7')).bySeat.find((s) => s.seat === 2)!;
    expect(seat2.orders[0]!.outcome).not.toBe('SAFE');
    // The test order shows in the log too, line by line.
    const { events } = await pos.events(ctx, loc);
    expect(events[0]!.order?.lines.map((l) => [l.seat, l.outcome])).toEqual([
      [1, 'PLACED_NO_ALLERGY'],
      [2, 'PLACED'],
    ]);
  });

  it('a signed webhook for the same order adds nothing twice', async () => {
    const { connection } = await pos.status(ctx, loc);
    const url = `https://plateguard.example${connection!.webhookPath}`;
    await pos.setWebhook(ctx, loc, { url, signatureKey: 'signature-key-123' });
    const orderId = [...square.orders.keys()][0]!;
    const body = Buffer.from(
      JSON.stringify({
        event_id: randomUUID(),
        type: 'order.created',
        data: {
          type: 'order_created',
          id: orderId,
          object: { order_created: { order_id: orderId } },
        },
      }),
    );
    const headers = {
      'x-square-hmacsha256-signature': squareSignature('signature-key-123', url, body),
    };
    await expect(
      hooks.receive('square', connection!.id, { headers: {}, body }),
    ).rejects.toMatchObject({ status: 401 });
    // The refused message shows in the log, so admin sees Square did send something.
    expect((await pos.events(ctx, loc)).events[0]).toMatchObject({
      status: 'DEAD',
      rejected: 'WEBHOOK_SIGNATURE_INVALID',
    });
    expect(await hooks.receive('square', connection!.id, { headers, body })).toEqual({
      stored: 1,
      duplicates: 0,
    });
    expect(await plates()).toHaveLength(2);
    const { events } = await pos.events(ctx, loc);
    expect(events[0]).toMatchObject({
      status: 'DONE',
      orderId,
      result: { plates: 0, duplicates: 2 },
    });
  });

  it('a new order rung up at the till arrives by webhook; unplaceable lines are counted', async () => {
    const { connection } = await pos.status(ctx, loc);
    const url = connection!.webhookUrl!;
    const variation = (dishId: string) =>
      square.items.find((i) => i.name === (dishId === salad ? 'Salad' : 'Bread soup'))!.variationId;
    const orderId = square.ring({
      ticket_name: 'Tafel 7',
      line_items: [
        {
          uid: 'a',
          name: 'Salad',
          catalog_object_id: variation(salad),
          quantity: '2',
          note: 'stoel 3',
        },
        { uid: 'b', name: 'Bread soup', catalog_object_id: variation(soup), quantity: '1' },
        { uid: 'c', catalog_object_id: 'UNKNOWN', quantity: '1', note: 'stoel 1' },
        {
          uid: 'd',
          name: 'Bread soup',
          catalog_object_id: variation(soup),
          quantity: '1',
          note: 'stoel 9',
        },
      ],
    });
    const body = Buffer.from(
      JSON.stringify({
        event_id: randomUUID(),
        type: 'order.updated',
        data: { id: orderId, object: { order_updated: { order_id: orderId } } },
      }),
    );
    const headers = {
      'x-square-hmacsha256-signature': squareSignature('signature-key-123', url, body),
    };
    await hooks.receive('square', connection!.id, { headers, body });
    const { events } = await pos.events(ctx, loc);
    expect(events[0]!.result).toEqual({
      orders: 1,
      plates: 2,
      duplicates: 0,
      unmapped: 1,
      noSeat: 1,
      noTable: 0,
      failed: 1,
      withoutAllergy: 2,
    });
    // Line by line, with the reason a line did not become a plate.
    expect(events[0]!.order).toEqual({
      table: '7',
      skipped: null,
      lines: [
        { name: 'Salad', seat: 3, quantity: 1, outcome: 'PLACED_NO_ALLERGY' },
        { name: 'Salad', seat: 3, quantity: 1, outcome: 'PLACED_NO_ALLERGY' },
        { name: 'Bread soup', seat: null, quantity: 1, outcome: 'NO_SEAT' },
        { name: 'UNKNOWN', seat: 1, quantity: 1, outcome: 'UNMAPPED' },
        {
          name: 'Bread soup',
          seat: 9,
          quantity: 1,
          outcome: 'FAILED',
          reason: 'SEAT_NOT_AT_TABLE',
        },
      ],
    });
    expect((await plates()).filter(([seat]) => seat === 3)).toEqual([
      [3, 'Salad'],
      [3, 'Salad'],
    ]);
  });

  it('an order for an unknown table is counted, and pulling finds nothing new', async () => {
    square.ring({ reference_id: 'Tafel 99', line_items: [] });
    const result = await pos.sync(ctx, loc);
    expect(result).toMatchObject({ noTable: 1, plates: 0 });
    expect(result.duplicates).toBe(4);
  });

  it('a paid order goes to the kitchen when recent; an old closed one is skipped with the reason', async () => {
    const { connection } = await pos.status(ctx, loc);
    const url = connection!.webhookUrl!;
    const soupItem = square.items.find((i) => i.name === 'Bread soup')!.variationId;
    const send = async (orderId: string) => {
      const body = Buffer.from(
        JSON.stringify({
          event_id: randomUUID(),
          type: 'order.created',
          data: { id: orderId, object: { order_created: { order_id: orderId } } },
        }),
      );
      const headers = {
        'x-square-hmacsha256-signature': squareSignature('signature-key-123', url, body),
      };
      await hooks.receive('square', connection!.id, { headers, body });
      return (await pos.events(ctx, loc)).events[0]!;
    };
    const paid = square.ring({
      ticket_name: 'Tafel 7',
      line_items: [
        {
          uid: 'p',
          name: 'Bread soup',
          catalog_object_id: soupItem,
          quantity: '1',
          note: 'stoel 2',
        },
      ],
    });
    square.orders.get(paid)!.state = 'COMPLETED';
    expect((await send(paid)).order).toMatchObject({
      skipped: null,
      lines: [{ name: 'Bread soup', seat: 2, outcome: 'PLACED' }],
    });
    const old = square.ring({
      ticket_name: 'Tafel 7',
      line_items: [{ uid: 'q', catalog_object_id: soupItem, quantity: '1', note: 'stoel 2' }],
    });
    Object.assign(square.orders.get(old)!, {
      state: 'COMPLETED',
      created_at: new Date(Date.now() - 5 * 3600_000).toISOString(),
    });
    expect((await send(old)).order).toEqual({ table: '7', skipped: 'CLOSED', lines: [] });
  });

  it('disconnecting removes the secrets and audits every step', async () => {
    const { connection } = await pos.status(ctx, loc);
    await pos.disconnect(ctx, loc);
    expect((await pos.status(ctx, loc)).connection).toBeNull();
    const row = await db.integrationConnection.findUniqueOrThrow({ where: { id: connection!.id } });
    expect(row.encryptedSecrets).toBeNull();
    const types = (await db.auditEvent.findMany({ where: { organizationId: org } })).map(
      (e) => e.type,
    );
    for (const t of [
      'integration.connected',
      'integration.items_mapped',
      'integration.webhook_set',
      'integration.disconnected',
    ])
      expect(types).toContain(t);
  });
});
