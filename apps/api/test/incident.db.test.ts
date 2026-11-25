/**
 * Incidents against a migrated database: a report from a plate freezes the facts (allergies,
 * assessment, checks, timeline with staff) and keeps the visit's guest data; later changes do not
 * alter it; closing needs cause and measure; the PDF renders. Skipped without DATABASE_URL.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { IncidentRepository } from '../src/modules/incident/incident.repository.js';
import { IncidentService } from '../src/modules/incident/incident.service.js';
import { KitchenService } from '../src/modules/kitchen/kitchen.service.js';
import { MenuRepository } from '../src/modules/service/menu.repository.js';
import { ServiceRepository } from '../src/modules/service/service.repository.js';
import { ServiceService } from '../src/modules/service/service.service.js';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('incidents', () => {
  const prisma = new PrismaService();
  const db = prisma.system();
  const repo = new ServiceRepository(prisma);
  const menu = new MenuRepository(prisma);
  const service = new ServiceService(repo, menu);
  const kitchen = new KitchenService(repo, menu);
  const incidents = new IncidentService(new IncidentRepository(prisma));
  const org = randomUUID();
  const loc: string = randomUUID();
  const waiter: string = randomUUID();
  const manager: string = randomUUID();
  const ctx = { organizationId: org, locationIds: [loc], userId: waiter };
  const mgr = { ...ctx, userId: manager };
  let salad = '';
  let plateId = '';
  let incidentId = '';

  const code = (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: { response?: { code?: string } }) => e.response?.code,
    );

  beforeAll(async () => {
    await db.user.create({ data: { id: waiter, name: 'Wendy' } });
    await db.user.create({ data: { id: manager, name: 'Mo' } });
    await db.organization.create({ data: { id: org, name: 'Test', plan: 'test' } });
    await db.location.create({
      data: { id: loc, organizationId: org, name: 'Bistro', slug: `inc-${loc}` },
    });
    await db.roleAssignment.createMany({
      data: [
        { userId: waiter, organizationId: org, locationId: loc, role: 'WAITER' },
        { userId: manager, organizationId: org, locationId: loc, role: 'MANAGER' },
      ],
    });
    await db.servicePoint.create({
      data: { locationId: loc, label: '5', seats: 2, qrToken: `inc-${loc}` },
    });
    const verified = { verifiedAt: new Date(), verifiedSource: 'test' };
    const bread = await db.ingredient.create({
      data: { organizationId: org, name: 'Bread', contains: ['GLUTEN_WHEAT'], ...verified },
    });
    const croutons = await db.component.create({
      data: { organizationId: org, name: 'Croutons', omittable: true },
    });
    await db.componentIngredient.create({
      data: { organizationId: org, componentId: croutons.id, ingredientId: bread.id },
    });
    const d = await db.dish.create({ data: { locationId: loc, name: 'Salad', course: 1 } });
    await db.dishComponent.create({
      data: { locationId: loc, dishId: d.id, componentId: croutons.id },
    });
    salad = d.id;
    await service.saveSeat(
      ctx,
      loc,
      '5',
      1,
      { allergies: [{ allergen: 'GLUTEN', severity: 'ALLERGY' }], noAllergy: false },
      waiter,
    );
    await service.order(ctx, loc, '5', 1, salad, waiter);
    const [ticket] = (await kitchen.tickets(ctx, loc, 'en')).queue;
    plateId = ticket!.plateId;
    await kitchen.check(
      ctx,
      loc,
      plateId,
      ticket!.checklist.map((i) => i.id),
      'en',
    );
  });

  afterAll(() => prisma.onModuleDestroy());

  it('a report on a plate freezes allergies, assessment, checks and the timeline', async () => {
    ({ id: incidentId } = await incidents.report(
      ctx,
      loc,
      '5',
      {
        plateId,
        kind: 'REACTION',
        severity: 'HIGH',
        description: 'Guest felt itchy after the salad',
      },
      waiter,
    ));
    const i = await incidents.get(mgr, loc, incidentId);
    expect(i).toMatchObject({
      table: '5',
      seat: 1,
      kind: 'REACTION',
      status: 'OPEN',
      dishName: 'Salad',
      reportedBy: 'Wendy',
    });
    expect(i.snapshot.allergies).toEqual([{ label: 'GLUTEN', severity: 'ALLERGY' }]);
    expect(i.snapshot.plate).toMatchObject({ dishName: 'Salad', status: 'CHECKED' });
    expect(i.snapshot.plate!.modifications.map((m) => m.component)).toEqual(['Croutons']);
    expect(i.snapshot.checks).toMatchObject([{ kind: 'KITCHEN', by: 'Wendy' }]);
    expect(i.snapshot.timeline.map((e) => e.type)).toEqual(
      expect.arrayContaining(['guest.allergies_recorded', 'order.created', 'plate.checked']),
    );
    const visit = await db.visit.findFirstOrThrow({ where: { locationId: loc } });
    expect(visit.anonymizeFrozen).toBe(true);
  });

  it('stays as it was when the seat changes afterwards', async () => {
    await service.saveSeat(ctx, loc, '5', 1, { allergies: [], noAllergy: true }, waiter);
    const i = await incidents.get(mgr, loc, incidentId);
    expect(i.snapshot.allergies).toHaveLength(1);
  });

  it('a report without a plate, and refusals for a wrong plate or seat', async () => {
    const { id } = await incidents.report(
      ctx,
      loc,
      '5',
      { seat: 2, kind: 'NEAR_MISS', severity: 'LOW', description: 'Wrong plate almost served' },
      waiter,
    );
    expect((await incidents.get(mgr, loc, id)).snapshot.plate).toBeNull();
    const base = { kind: 'OTHER' as const, severity: 'LOW' as const, description: 'xyz' };
    expect(await code(incidents.report(ctx, loc, '5', { ...base, seat: 9 }, waiter))).toBe(
      'SEAT_NOT_AT_TABLE',
    );
    expect(
      await code(incidents.report(ctx, loc, '5', { ...base, plateId: randomUUID() }, waiter)),
    ).toBe('PLATE_NOT_FOUND');
    expect(await code(incidents.report(ctx, loc, '99', base, waiter))).toBe('TABLE_NOT_FOUND');
    expect((await incidents.list(mgr, loc)).incidents.map((x) => x.kind)).toEqual([
      'NEAR_MISS',
      'REACTION',
    ]);
  });

  it('closes only with cause and measure, and records who closed it', async () => {
    expect(
      await code(
        incidents.followUp(mgr, loc, incidentId, { cause: 'x', measure: '', close: true }, manager),
      ),
    ).toBe('INCIDENT_FOLLOW_UP_INCOMPLETE');
    const closed = await incidents.followUp(
      mgr,
      loc,
      incidentId,
      { cause: 'Croutons were not left off', measure: 'Croutons in a separate bowl', close: true },
      manager,
    );
    expect(closed).toMatchObject({ status: 'CLOSED', closedBy: 'Mo' });
    const types = (await db.auditEvent.findMany({ where: { organizationId: org } })).map(
      (e) => e.type,
    );
    expect(types).toEqual(expect.arrayContaining(['incident.reported', 'incident.closed']));
  });

  it('renders the report as a PDF', async () => {
    const pdf = await incidents.pdf(mgr, loc, incidentId, 'nl');
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1500);
  });

  it('another location cannot read it', async () => {
    const other = { organizationId: org, locationIds: [randomUUID()], userId: manager };
    expect(await code(incidents.get(other, loc, incidentId))).toBe('INCIDENT_NOT_FOUND');
  });
});
