/**
 * The service flow against a migrated database: seats, orders with a stored assessment,
 * alerts only from orders, cancelling, and tenant isolation. Skipped without DATABASE_URL.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { MenuRepository } from '../src/modules/service/menu.repository.js';
import { ServiceRepository } from '../src/modules/service/service.repository.js';
import { ServiceService } from '../src/modules/service/service.service.js';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('service flow', () => {
  const prisma = new PrismaService();
  const db = prisma.system();
  const service = new ServiceService(new ServiceRepository(prisma), new MenuRepository(prisma));
  const org = randomUUID();
  const loc: string = randomUUID();
  const otherOrg = randomUUID();
  const otherLoc: string = randomUUID();
  const user: string = randomUUID();
  const ctx = { organizationId: org, locationIds: [loc], userId: user };
  let salad = '';
  let soup = '';

  beforeAll(async () => {
    await db.user.create({ data: { id: user, name: 'Test waiter' } });
    for (const [o, l] of [
      [org, loc],
      [otherOrg, otherLoc],
    ] as const) {
      await db.organization.create({ data: { id: o, name: 'Test', plan: 'test' } });
      await db.location.create({
        data: { id: l, organizationId: o, name: 'Test', slug: `s-${l}` },
      });
      const floor = await db.floor.create({
        data: { locationId: l, name: 'Inside', sortOrder: 0 },
      });
      await db.servicePoint.create({
        data: { locationId: l, floorId: floor.id, label: '4', seats: 2, qrToken: `q-${l}` },
      });
    }
    const verified = { verifiedAt: new Date(), verifiedSource: 'test' };
    const bread = await db.ingredient.create({
      data: { organizationId: org, name: 'Bread', contains: ['GLUTEN_WHEAT'], ...verified },
    });
    const tomato = await db.ingredient.create({
      data: { organizationId: org, name: 'Tomato', contains: [], mayContain: [], ...verified },
    });
    const croutons = await db.component.create({ data: { organizationId: org, name: 'Croutons' } });
    const soupC = await db.component.create({ data: { organizationId: org, name: 'Soup' } });
    await db.componentIngredient.createMany({
      data: [
        { organizationId: org, componentId: croutons.id, ingredientId: bread.id },
        { organizationId: org, componentId: soupC.id, ingredientId: tomato.id },
      ],
    });
    salad = (await db.dish.create({ data: { locationId: loc, name: 'Salad', course: 1 } })).id;
    soup = (await db.dish.create({ data: { locationId: loc, name: 'Soup', course: 1 } })).id;
    await db.dishComponent.createMany({
      data: [
        { locationId: loc, dishId: salad, componentId: croutons.id },
        { locationId: loc, dishId: soup, componentId: soupC.id },
      ],
    });
  });

  afterAll(() => prisma.onModuleDestroy());

  it('raises no alert before anything is ordered', async () => {
    await service.saveSeat(
      ctx,
      loc,
      '4',
      1,
      {
        allergies: [{ allergen: 'GLUTEN', severity: 'SEVERE' }],
        noAllergy: false,
      },
      user,
    );
    expect(await service.alerts(ctx, loc, 'en', user)).toEqual([]);
    const [floor] = await service.floors(ctx, loc);
    expect(floor?.tables[0]).toMatchObject({ guests: 1, allergyGuests: 1, openAlerts: 0 });
  });

  it('stores the order with its assessment, and alerts when it cannot be served', async () => {
    // Ordering a dish the guest must not have takes a note from the waiter.
    await expect(service.order(ctx, loc, '4', 1, salad, user)).rejects.toMatchObject({
      response: { code: 'NOTE_REQUIRED' },
    });
    await expect(service.order(ctx, loc, '4', 1, salad, user, '  ')).rejects.toThrow();
    const table = await service.order(ctx, loc, '4', 1, salad, user, ' Guest insists ');
    const line = table.bySeat[0]?.orders[0];
    expect(line).toMatchObject({ dishId: salad, outcome: 'DO_NOT_SERVE', note: 'Guest insists' });
    const stored = await db.assessment.findUnique({ where: { plateId: line!.id } });
    expect(stored?.outcome).toBe('DO_NOT_SERVE');
    const event = await db.auditEvent.findFirst({
      where: { entityId: line!.id, type: 'order.created' },
    });
    expect(event?.payload).toMatchObject({ outcome: 'DO_NOT_SERVE', note: 'Guest insists' });
    await service.order(ctx, loc, '4', 1, soup, user);
    const alerts = await service.alerts(ctx, loc, 'en', user);
    expect(alerts.map((a) => [a.table, a.seat, a.dishName, a.kind])).toEqual([
      ['4', 1, 'Salad', 'stop'],
    ]);
  });

  it('an opened alert stays, marked read for that person only', async () => {
    const [alert] = await service.alerts(ctx, loc, 'en', user);
    expect(alert?.read).toBe(false);
    const after = await service.markAlertsRead(ctx, loc, 'en', user, [alert!.id]);
    expect(after.map((a) => [a.id, a.read])).toEqual([[alert!.id, true]]);
    // Someone else still sees it unread; "mark all" reads it for them too.
    const colleague = randomUUID();
    await db.user.create({ data: { id: colleague, name: 'Colleague' } });
    expect((await service.alerts(ctx, loc, 'en', colleague))[0]?.read).toBe(false);
    const all = await service.markAlertsRead(ctx, loc, 'en', colleague);
    expect(all.every((a) => a.read)).toBe(true);
  });

  it('a cancelled order no longer alerts', async () => {
    const table = await service.table(ctx, loc, '4');
    const saladLine = table.bySeat[0]!.orders.find((o) => o.dishId === salad)!;
    await service.cancelOrder(ctx, loc, '4', saladLine.id);
    expect(await service.alerts(ctx, loc, 'en', user)).toEqual([]);
    await expect(service.cancelOrder(ctx, loc, '4', saladLine.id)).rejects.toThrow();
  });

  it('another organization sees none of it', async () => {
    const other = { organizationId: otherOrg, locationIds: [otherLoc], userId: user };
    const table = await service.table(other, otherLoc, '4');
    expect(table.bySeat).toEqual([]);
    // Asking for the first location with the other tenant finds nothing: RLS hides it.
    await expect(service.table(other, loc, '4')).rejects.toThrow();
    expect((await service.getMenu(other, loc, 'en')).dishes).toEqual([]);
  });

  it('refuses an ingredient allergy that is not in the organization list', async () => {
    await expect(
      service.saveSeat(
        ctx,
        loc,
        '4',
        2,
        {
          allergies: [{ ingredient: { id: randomUUID(), name: 'Ghost' }, severity: 'SEVERE' }],
          noAllergy: false,
        },
        user,
      ),
    ).rejects.toThrow();
  });
});
