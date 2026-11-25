/**
 * Allergy tickets on a CloudPRNT kitchen printer, against a migrated database: a ticket is queued
 * with the order, the printer polls, fetches and confirms it, and the plate moves to the kitchen.
 * Skipped without DATABASE_URL.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { KitchenService } from '../src/modules/kitchen/kitchen.service.js';
import { PrintRepository } from '../src/modules/print/print.repository.js';
import { PrintService } from '../src/modules/print/print.service.js';
import { MenuRepository } from '../src/modules/service/menu.repository.js';
import { ServiceRepository } from '../src/modules/service/service.repository.js';
import { ServiceService } from '../src/modules/service/service.service.js';
import { CloudPrntAdapter } from '../src/integrations/adapters/cloudprnt/cloudprnt.adapter.js';
import { AdapterRegistry } from '../src/integrations/core/registry.js';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('kitchen printer', () => {
  const prisma = new PrismaService();
  const db = prisma.system();
  const repo = new ServiceRepository(prisma);
  const menu = new MenuRepository(prisma);
  const service = new ServiceService(repo, menu);
  const kitchen = new KitchenService(repo, menu);
  const printRepo = new PrintRepository(prisma);
  const print = new PrintService(
    printRepo,
    kitchen,
    new AdapterRegistry().register(new CloudPrntAdapter()),
  );
  const org = randomUUID();
  const loc: string = randomUUID();
  const user: string = randomUUID();
  const ctx = { organizationId: org, locationIds: [loc], userId: user };
  let toast = '';
  let printer = '';
  let key = '';

  const code = (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: { status?: number }) => e.status,
    );

  beforeAll(async () => {
    await db.user.create({ data: { id: user, name: 'Test waiter' } });
    await db.organization.create({ data: { id: org, name: 'Test', plan: 'test' } });
    await db.location.create({
      data: { id: loc, organizationId: org, name: 'Haven', slug: `p-${loc}`, kitchenLocale: 'nl' },
    });
    const floor = await db.floor.create({ data: { locationId: loc, name: 'In', sortOrder: 0 } });
    await db.servicePoint.create({
      data: { locationId: loc, floorId: floor.id, label: '4', seats: 2, qrToken: `p-${loc}` },
    });
    const bread = await db.ingredient.create({
      data: {
        organizationId: org,
        name: 'Brood',
        contains: ['GLUTEN_WHEAT'],
        verifiedAt: new Date(),
        verifiedSource: 'test',
      },
    });
    const slice = await db.component.create({
      data: { organizationId: org, name: 'Snee', omittable: true },
    });
    await db.componentIngredient.create({
      data: { organizationId: org, componentId: slice.id, ingredientId: bread.id },
    });
    const d = await db.dish.create({ data: { locationId: loc, name: 'Toast', course: 1 } });
    await db.dishComponent.create({
      data: { locationId: loc, dishId: d.id, componentId: slice.id },
    });
    toast = d.id;
    await service.saveSeat(
      ctx,
      loc,
      '4',
      1,
      { allergies: [{ allergen: 'GLUTEN', severity: 'ALLERGY' }], noAllergy: false },
      user,
    );
    await service.saveSeat(ctx, loc, '4', 2, { allergies: [], noAllergy: true }, user);
  });

  afterAll(() => prisma.onModuleDestroy());

  it('only answers on the address with the right key', async () => {
    ({ id: printer, key } = await printRepo.add(ctx, loc, 'Keuken'));
    expect(await print.poll(printer, key, { statusCode: '200 OK' })).toEqual({ jobReady: false });
    expect(await code(print.poll(printer, 'wrong-key', {}))).toBe(404);
    expect(await code(print.poll('not-a-printer', key, {}))).toBe(404);
    const [summary] = await printRepo.printers(ctx, loc);
    expect(summary).toMatchObject({ name: 'Keuken', fault: false, waiting: 0 });
    expect(summary!.lastSeenAt).not.toBeNull();
  });

  it('queues a ticket with an allergy order, and none for a guest without allergies', async () => {
    await service.order(ctx, loc, '4', 2, toast, user);
    expect(await print.poll(printer, key, {})).toEqual({ jobReady: false });
    await service.order(ctx, loc, '4', 1, toast, user);
    const poll = await print.poll(printer, key, {});
    expect(poll).toMatchObject({
      jobReady: true,
      mediaTypes: ['text/vnd.star.markup', 'text/plain'],
    });
    expect((await kitchen.tickets(ctx, loc, 'nl')).printers).toBe(1);
  });

  it('prints the ticket in the kitchen language, and a confirmed print moves the plate', async () => {
    const { jobToken } = await print.poll(printer, key, {});
    const job = await print.fetch(printer, key, 'text/plain', jobToken);
    expect(job.type).toBe('text/plain');
    expect(job.body).toContain('ALLERGIEBON');
    expect(job.body).toContain('Tafel 4 · Stoel 1 · Gang 1');
    expect(job.body).toContain('[ ] GLUTEN: Allergie');
    expect(job.body).toContain('[ ] Zonder Snee');
    const markup = await print.fetch(printer, key, 'text/vnd.star.markup', jobToken);
    expect(markup.body).toContain('[cut: feed; partial]');
    expect(markup.body).toContain('\\[ ] GLUTEN');

    // Fetched and not yet confirmed: not offered again straight away.
    expect(await print.poll(printer, key, {})).toEqual({ jobReady: false });
    await print.confirm(printer, key, '200 OK', jobToken);
    const plate = await db.plateOrder.findFirstOrThrow({
      where: { locationId: loc, guest: { seat: 1 } },
    });
    expect(plate.status).toBe('IN_KITCHEN');
    const events = await db.auditEvent.findMany({
      where: { entityId: plate.id, type: 'plate.ticket_printed' },
    });
    expect(events).toHaveLength(1);
    // The kitchen screen still shows the plate to check.
    expect((await kitchen.tickets(ctx, loc, 'nl')).queue.map((t) => t.plateId)).toEqual([plate.id]);
  });

  it('offers a failed print again, and the kitchen can print a ticket again', async () => {
    const plate = await db.plateOrder.findFirstOrThrow({
      where: { locationId: loc, guest: { seat: 1 } },
    });
    await printRepo.queue(ctx, loc, { kind: 'REPRINT', plateId: plate.id });
    const first = await print.poll(printer, key, {});
    const job = await print.fetch(printer, key, 'text/plain', first.jobToken);
    expect(job.body).toContain('OPNIEUW GEPRINT');
    await print.confirm(printer, key, '410 Paper Empty', first.jobToken);
    const [summary] = await printRepo.printers(ctx, loc);
    expect(summary!.waiting).toBe(1);
    const again = await print.poll(printer, key, { statusCode: '410 Paper Empty' });
    expect(again.jobToken).toBe(first.jobToken);
    expect((await printRepo.printers(ctx, loc))[0]!.fault).toBe(true);
  });

  it('a new address replaces the old one, and a removed printer stops answering', async () => {
    const fresh = await printRepo.newKey(ctx, loc, printer);
    expect(await code(print.poll(printer, key, {}))).toBe(404);
    // The reprint from before goes out first, then the test page.
    const reprint = await print.poll(printer, fresh, {});
    await print.fetch(printer, fresh, 'text/plain', reprint.jobToken);
    await print.confirm(printer, fresh, '200 OK', reprint.jobToken);
    await printRepo.queue(ctx, loc, { kind: 'TEST', printerId: printer });
    const test = await print.poll(printer, fresh, {});
    const page = await print.fetch(printer, fresh, 'text/plain', test.jobToken);
    expect(page.body).toContain('Deze printer print de allergiebonnen van');
    await printRepo.remove(ctx, loc, printer);
    expect(await code(print.poll(printer, fresh, {}))).toBe(404);
    expect(await printRepo.printers(ctx, loc)).toEqual([]);
    expect(await db.printJob.count({ where: { connectionId: printer, status: 'PENDING' } })).toBe(
      0,
    );
  });
});
