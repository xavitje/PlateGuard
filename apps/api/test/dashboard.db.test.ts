/**
 * The management dashboard against a migrated database: only plates for guests with allergies
 * count, checks and times are measured, free-text allergies are listed, and a manager of one
 * location sees that location while the owner sees the group. Skipped without DATABASE_URL.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Principal } from '@plateguard/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { DashboardRepository } from '../src/modules/dashboard/dashboard.repository.js';
import { DashboardService } from '../src/modules/dashboard/dashboard.service.js';
import { IncidentRepository } from '../src/modules/incident/incident.repository.js';
import { IncidentService } from '../src/modules/incident/incident.service.js';
import { KitchenService } from '../src/modules/kitchen/kitchen.service.js';
import { MenuRepository } from '../src/modules/service/menu.repository.js';
import { ServiceRepository } from '../src/modules/service/service.repository.js';
import { ServiceService } from '../src/modules/service/service.service.js';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('dashboard', () => {
  const prisma = new PrismaService();
  const db = prisma.system();
  const repo = new ServiceRepository(prisma);
  const menu = new MenuRepository(prisma);
  const service = new ServiceService(repo, menu);
  const kitchen = new KitchenService(repo, menu);
  const incidents = new IncidentService(new IncidentRepository(prisma));
  const dashboard = new DashboardService(new DashboardRepository(prisma));
  const org = randomUUID();
  const a: string = randomUUID();
  const b: string = randomUUID();
  const user: string = randomUUID();
  const at = (loc: string) => ({ organizationId: org, locationIds: [loc], userId: user });
  const owner: Principal = {
    userId: user,
    grants: [{ organizationId: org, locationId: null, role: 'OWNER' }],
  };
  const managerOfA: Principal = {
    userId: user,
    grants: [{ organizationId: org, locationId: a, role: 'MANAGER' }],
  };

  async function location(id: string, name: string) {
    await db.location.create({ data: { id, organizationId: org, name, slug: `dash-${id}` } });
    await db.servicePoint.create({
      data: { locationId: id, label: '1', seats: 4, qrToken: `dash-${id}` },
    });
    const verified = { verifiedAt: new Date(), verifiedSource: 'test' };
    const bread = await db.ingredient.create({
      data: { organizationId: org, name: `Bread ${name}`, contains: ['GLUTEN_WHEAT'], ...verified },
    });
    const c = await db.component.create({
      data: { organizationId: org, name: 'Croutons', omittable: true },
    });
    await db.componentIngredient.create({
      data: { organizationId: org, componentId: c.id, ingredientId: bread.id },
    });
    const d = await db.dish.create({ data: { locationId: id, name: 'Salad', course: 1 } });
    await db.dishComponent.create({ data: { locationId: id, dishId: d.id, componentId: c.id } });
    return d.id;
  }

  beforeAll(async () => {
    await db.user.create({ data: { id: user, name: 'Owner' } });
    await db.organization.create({ data: { id: org, name: 'Group', plan: 'test' } });
    await db.roleAssignment.create({
      data: { userId: user, organizationId: org, locationId: null, role: 'OWNER' },
    });
    const saladA = await location(a, 'Amsterdam');
    const saladB = await location(b, 'Utrecht');
    const ctx = at(a);
    const seat = (n: number, allergies: Parameters<typeof service.saveSeat>[4]['allergies']) =>
      service.saveSeat(ctx, a, '1', n, { allergies, noAllergy: allergies.length === 0 }, user);
    await seat(1, [{ allergen: 'GLUTEN', severity: 'ALLERGY' }]);
    await seat(2, []);
    await seat(3, [{ custom: 'Saffron', severity: 'SEVERE' }]);
    // Seat 1: one plate checked and served, one sent back. Seat 2: no allergies, not counted.
    // Seat 3: a free-text allergy the recipes cannot judge.
    await service.order(ctx, a, '1', 1, saladA, user);
    await service.order(ctx, a, '1', 1, saladA, user);
    await service.order(ctx, a, '1', 2, saladA, user);
    await service.order(ctx, a, '1', 3, saladA, user);
    const queue = (await kitchen.tickets(ctx, a, 'en')).queue.filter((t) => t.seat === 1);
    await kitchen.check(
      ctx,
      a,
      queue[0]!.plateId,
      queue[0]!.checklist.map((i) => i.id),
      'en',
    );
    await kitchen.serve(ctx, a, queue[0]!.plateId);
    await kitchen.reject(ctx, a, queue[1]!.plateId, 'missing');
    await incidents.report(
      ctx,
      a,
      '1',
      { seat: 3, kind: 'NEAR_MISS', severity: 'MEDIUM', description: 'Caught at the pass' },
      user,
    );
    // The visit closes with seat 3's plate never checked by the kitchen.
    await db.visit.updateMany({ where: { locationId: a }, data: { closedAt: new Date() } });

    const ctxB = at(b);
    await service.saveSeat(
      ctxB,
      b,
      '1',
      1,
      { allergies: [{ custom: 'saffron', severity: 'ALLERGY' }], noAllergy: false },
      user,
    );
    await service.order(ctxB, b, '1', 1, saladB, user);
  });

  afterAll(() => prisma.onModuleDestroy());

  it('counts only allergy plates, with checks, outcomes and incidents per location', async () => {
    const d = await dashboard.get(owner, org, 30);
    expect(d.locations.map((l) => l.name)).toEqual(['Amsterdam', 'Utrecht']);
    const amsterdam = d.locations[0]!;
    expect(amsterdam).toMatchObject({
      flagged: 3,
      served: 1,
      rejected: 1,
      noKitchenCheck: 1,
      noPassCheck: null,
      customAllergies: 1,
      incidents: 1,
      openIncidents: 1,
    });
    expect(amsterdam.checkMinutes).not.toBeNull();
    expect(amsterdam.serveMinutes).not.toBeNull();
    expect(Object.values(amsterdam.outcomes).reduce((n, x) => n + x, 0)).toBe(3);
    expect(d.locations[1]).toMatchObject({ flagged: 1, noKitchenCheck: 0, incidents: 0 });
    expect(d.total).toMatchObject({ flagged: 4, customAllergies: 2, incidents: 1 });
  });

  it('lists free-text allergies over the group, the same word once', async () => {
    const d = await dashboard.get(owner, org, 30);
    expect(d.unknownItems).toEqual([{ label: 'Saffron', count: 2 }]);
  });

  it('a manager of one location sees only that location', async () => {
    const d = await dashboard.get(managerOfA, org, 30);
    expect(d.locations.map((l) => l.name)).toEqual(['Amsterdam']);
    expect(d.total.flagged).toBe(3);
  });

  it('leaves out plates from before the period', async () => {
    const later = new Date(Date.now() + 40 * 86_400_000);
    expect((await dashboard.get(owner, org, 30, later)).total.flagged).toBe(0);
  });
});
