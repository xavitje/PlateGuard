/**
 * The public guest menu against a migrated database: only the published menu, judged for what
 * the guest avoids, without recipe details. Skipped without DATABASE_URL.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { GuestRepository } from '../src/modules/guest/guest.repository.js';
import { GuestService } from '../src/modules/guest/guest.service.js';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('guest menu', () => {
  const prisma = new PrismaService();
  const db = prisma.system();
  const guest = new GuestService(new GuestRepository(prisma));
  const org = randomUUID();
  const loc = randomUUID();
  const slug = `g-${loc}`;
  const dish = (id: string, name: string, omittable: boolean) => ({
    kind: 'dish',
    id,
    name,
    components: [
      {
        id: `c-${id}`,
        name: 'Croutons',
        omittable,
        premixed: false,
        suitableForSevere: false,
        preparedWith: [],
        components: [],
        substitutions: [],
        ingredients: [
          { id: 'i', name: 'Bread', contains: ['GLUTEN_WHEAT'], mayContain: [], verified: true },
        ],
      },
    ],
  });

  beforeAll(async () => {
    await db.organization.create({ data: { id: org, name: 'Test', plan: 'test' } });
    await db.location.create({ data: { id: loc, organizationId: org, name: 'Bistro', slug } });
  });
  afterAll(() => prisma.onModuleDestroy());

  it('shows nothing before a menu is published', async () => {
    expect(await guest.menu(slug, 'en', [])).toEqual({
      location: { name: 'Bistro' },
      published: false,
      dishes: [],
    });
    await expect(guest.menu('no-such-place', 'en', [])).rejects.toThrow();
  });

  it('judges the latest published menu for what the guest avoids', async () => {
    const salad = randomUUID();
    const toast = randomUUID();
    await db.dish.createMany({
      data: [
        { id: salad, locationId: loc, name: 'Salad', course: 1 },
        { id: toast, locationId: loc, name: 'Toast', course: 2 },
      ],
    });
    const snapshot = { dishes: { en: [dish(toast, 'Toast', false), dish(salad, 'Salad', true)] } };
    const menu = await db.menu.create({ data: { locationId: loc, name: 'Menu' } });
    await db.menuVersion.create({
      data: {
        menuId: menu.id,
        locationId: loc,
        version: 1,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        snapshot,
      },
    });
    const plain = await guest.menu(slug, 'nl', []);
    expect(plain.dishes).toEqual([
      { id: toast, name: 'Toast', course: 2 },
      { id: salad, name: 'Salad', course: 1 },
    ]);
    const avoiding = await guest.menu(slug, 'en', ['GLUTEN']);
    expect(avoiding.dishes.map((d) => [d.name, d.outcome, d.changes])).toEqual([
      ['Toast', 'DO_NOT_SERVE', []],
      ['Salad', 'ADAPTABLE', [{ action: 'OMIT', componentName: 'Croutons' }]],
    ]);
    // Only names and outcomes: no ingredients leave the restaurant.
    expect(JSON.stringify(avoiding)).not.toContain('Bread');
  });
});
