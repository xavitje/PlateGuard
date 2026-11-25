/**
 * The kitchen flow against a migrated database: tickets from orders, the checklist that must be
 * complete, the optional pass check, rejecting back to the waiter, and the audit trail.
 * Skipped without DATABASE_URL.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { KitchenService } from '../src/modules/kitchen/kitchen.service.js';
import { MenuRepository } from '../src/modules/service/menu.repository.js';
import { ServiceRepository } from '../src/modules/service/service.repository.js';
import { ServiceService } from '../src/modules/service/service.service.js';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('kitchen flow', () => {
  const prisma = new PrismaService();
  const db = prisma.system();
  const repo = new ServiceRepository(prisma);
  const menu = new MenuRepository(prisma);
  const service = new ServiceService(repo, menu);
  const kitchen = new KitchenService(repo, menu);
  const org = randomUUID();
  const loc: string = randomUUID();
  const user: string = randomUUID();
  const ctx = { organizationId: org, locationIds: [loc], userId: user };
  let salad = '';
  let toast = '';
  let soup = '';

  const code = (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: { response?: { code?: string } }) => e.response?.code,
    );

  beforeAll(async () => {
    await db.user.create({ data: { id: user, name: 'Test cook' } });
    await db.organization.create({ data: { id: org, name: 'Test', plan: 'test' } });
    await db.location.create({
      data: { id: loc, organizationId: org, name: 'T', slug: `k-${loc}` },
    });
    const floor = await db.floor.create({ data: { locationId: loc, name: 'In', sortOrder: 0 } });
    await db.servicePoint.create({
      data: { locationId: loc, floorId: floor.id, label: '7', seats: 4, qrToken: `k-${loc}` },
    });
    const verified = { verifiedAt: new Date(), verifiedSource: 'test' };
    const bread = await db.ingredient.create({
      data: { organizationId: org, name: 'Bread', contains: ['GLUTEN_WHEAT'], ...verified },
    });
    const lettuce = await db.ingredient.create({
      data: { organizationId: org, name: 'Lettuce', ...verified },
    });
    const croutons = await db.component.create({
      data: { organizationId: org, name: 'Croutons', omittable: true },
    });
    const leaves = await db.component.create({ data: { organizationId: org, name: 'Leaves' } });
    const slice = await db.component.create({ data: { organizationId: org, name: 'Slice' } });
    await db.componentIngredient.createMany({
      data: [
        { organizationId: org, componentId: croutons.id, ingredientId: bread.id },
        { organizationId: org, componentId: leaves.id, ingredientId: lettuce.id },
        { organizationId: org, componentId: slice.id, ingredientId: bread.id },
      ],
    });
    const dish = async (name: string, components: string[]) => {
      const d = await db.dish.create({ data: { locationId: loc, name, course: 1 } });
      await db.dishComponent.createMany({
        data: components.map((componentId) => ({ locationId: loc, dishId: d.id, componentId })),
      });
      return d.id;
    };
    salad = await dish('Salad', [leaves.id, croutons.id]);
    toast = await dish('Toast', [slice.id]);
    soup = await dish('Leaf soup', [leaves.id]);
    await service.saveSeat(
      ctx,
      loc,
      '7',
      1,
      { allergies: [{ allergen: 'GLUTEN', severity: 'INTOLERANCE' }], noAllergy: false },
      user,
    );
    await service.saveSeat(ctx, loc, '7', 2, { allergies: [], noAllergy: true }, user);
  });

  afterAll(() => prisma.onModuleDestroy());

  it('makes a ticket for each allergy plate, with every risk point to tick', async () => {
    await service.order(ctx, loc, '7', 1, salad, user);
    await service.order(ctx, loc, '7', 2, soup, user);
    const { queue, ready, passCheck } = await kitchen.tickets(ctx, loc, 'en');
    expect(passCheck).toBe(false);
    expect(ready).toEqual([]);
    // Seat 2 has no allergies, so its soup needs no ticket.
    expect(queue.map((t) => [t.table, t.seat, t.dishName, t.block])).toEqual([
      ['7', 1, 'Salad', null],
    ]);
    expect(queue[0]!.checklist.map((i) => i.kind)).toEqual(['ALLERGY', 'OMIT']);
  });

  it('confirms only with the whole checklist ticked, and records who checked', async () => {
    const [ticket] = (await kitchen.tickets(ctx, loc, 'en')).queue;
    const ids = ticket!.checklist.map((i) => i.id);
    expect(await code(kitchen.check(ctx, loc, ticket!.plateId, ids.slice(0, 1), 'en'))).toBe(
      'CHECKLIST_INCOMPLETE',
    );
    await kitchen.check(ctx, loc, ticket!.plateId, ids, 'en');
    const after = await kitchen.tickets(ctx, loc, 'en');
    expect(after.queue).toEqual([]);
    expect(after.ready.map((t) => t.status)).toEqual(['CHECKED']);
    const checks = await db.plateCheck.findMany({ where: { plateId: ticket!.plateId } });
    expect(checks.map((c) => [c.kind, c.byUserId])).toEqual([['KITCHEN', user]]);
    // Checking twice loses: the plate is no longer waiting for the kitchen.
    expect(await code(kitchen.check(ctx, loc, ticket!.plateId, ids, 'en'))).toBe(
      'PLATE_STATUS_CHANGED',
    );
  });

  it('with the pass check on, serves only after a runner checked the plate', async () => {
    await kitchen.setPassCheck(ctx, loc, true);
    const [ticket] = (await kitchen.tickets(ctx, loc, 'en')).ready;
    expect(await code(kitchen.serve(ctx, loc, ticket!.plateId))).toBe('PLATE_STATUS_CHANGED');
    await kitchen.passChecked(ctx, loc, ticket!.plateId);
    await kitchen.serve(ctx, loc, ticket!.plateId);
    expect((await kitchen.tickets(ctx, loc, 'en')).ready).toEqual([]);
    const line = (await service.table(ctx, loc, '7')).bySeat[0]!.orders[0]!;
    expect(line.status).toBe('SERVED');
  });

  it('a plate that must not go out cannot be confirmed; rejecting sends it to the waiter', async () => {
    await service.saveSeat(
      ctx,
      loc,
      '7',
      3,
      { allergies: [{ allergen: 'GLUTEN', severity: 'SEVERE' }], noAllergy: false },
      user,
    );
    await service.order(ctx, loc, '7', 3, toast, user);
    const [ticket] = (await kitchen.tickets(ctx, loc, 'en')).queue;
    expect(ticket).toMatchObject({ dishName: 'Toast', block: 'DO_NOT_SERVE', checklist: [] });
    expect(await code(kitchen.check(ctx, loc, ticket!.plateId, [], 'en'))).toBe('PLATE_BLOCKED');

    await kitchen.reject(ctx, loc, ticket!.plateId, 'Bread is wheat');
    const seat3 = (await service.table(ctx, loc, '7')).bySeat.find((s) => s.seat === 3)!;
    expect(seat3.orders[0]).toMatchObject({ status: 'REJECTED', rejectReason: 'Bread is wheat' });
    const alerts = await service.alerts(ctx, loc, 'en');
    expect(alerts.map((a) => [a.seat, a.kind, a.rejected?.reason])).toEqual([
      [3, 'stop', 'Bread is wheat'],
    ]);
    // The waiter takes it off the order; then nothing is left to alert about.
    await service.cancelOrder(ctx, loc, '7', ticket!.plateId);
    expect(await service.alerts(ctx, loc, 'en')).toEqual([]);
  });

  it('writes an audit event for every step', async () => {
    const events = await db.auditEvent.findMany({
      where: { organizationId: org },
      orderBy: { at: 'asc' },
    });
    const types = events.map((e) => e.type);
    for (const t of [
      'guest.allergies_recorded',
      'order.created',
      'plate.checked',
      'location.pass_check_set',
      'plate.pass_checked',
      'plate.served',
      'plate.rejected',
      'order.cancelled',
    ])
      expect(types).toContain(t);
    expect(events.every((e) => e.actorId === user)).toBe(true);
  });
});
