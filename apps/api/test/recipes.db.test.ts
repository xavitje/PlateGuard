/**
 * The recipe editors and publishing against a migrated database: service works from the
 * published menu, recipe edits wait for the next publish, and orders keep the recipe they were
 * ordered from. Skipped without DATABASE_URL.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Principal } from '@plateguard/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { RecipesRepository } from '../src/modules/recipes/recipes.repository.js';
import { makesCycle, RecipesService } from '../src/modules/recipes/recipes.service.js';
import { MenuRepository } from '../src/modules/service/menu.repository.js';
import { ServiceRepository } from '../src/modules/service/service.repository.js';
import { ServiceService } from '../src/modules/service/service.service.js';

const hasDb = !!process.env.DATABASE_URL;

describe('makesCycle', () => {
  const graph = new Map([
    ['a', ['b']],
    ['b', ['c']],
  ]);
  it('finds a component that would contain itself', () => {
    expect(makesCycle(graph, 'c', ['a'])).toBe(true);
    expect(makesCycle(graph, 'a', ['a'])).toBe(true);
  });
  it('allows a shared child', () => {
    expect(makesCycle(graph, 'd', ['b', 'c'])).toBe(false);
  });
});

describe.skipIf(!hasDb)('recipes and publishing', () => {
  const prisma = new PrismaService();
  const db = prisma.system();
  const recipes = new RecipesService(new RecipesRepository(prisma));
  const service = new ServiceService(new ServiceRepository(prisma), new MenuRepository(prisma));
  const org = randomUUID();
  const loc = randomUUID();
  const userId = randomUUID();
  const ctx = { organizationId: org, locationIds: [loc], userId };
  const location = { id: loc, organizationId: org };
  const grant = (role: 'CHEF' | 'COOK' | 'MANAGER'): Principal => ({
    userId,
    grants: [{ organizationId: org, role, locationId: loc }],
  });
  const chef = grant('CHEF');
  let soupId = '';
  let breadId = '';
  let soupComponentId = '';

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, name: 'Test chef' } });
    await db.organization.create({ data: { id: org, name: 'Test', plan: 'test' } });
    await db.location.create({
      data: { id: loc, organizationId: org, name: 'Test', slug: `r-${loc}` },
    });
    const floor = await db.floor.create({ data: { locationId: loc, name: 'In', sortOrder: 0 } });
    await db.servicePoint.create({
      data: { locationId: loc, floorId: floor.id, label: '1', seats: 2, qrToken: `r-${loc}` },
    });
  });

  afterAll(() => prisma.onModuleDestroy());

  it('only a role with ingredient.verify can mark an ingredient verified', async () => {
    const input = { name: 'Tomato', synonyms: ['tomaat'], contains: [], mayContain: [] };
    await expect(
      recipes.saveIngredient(ctx, grant('COOK'), location, null, {
        ...input,
        verified: true,
      }),
    ).rejects.toThrow();
    const tomato = await recipes.saveIngredient(ctx, chef, location, null, {
      ...input,
      verified: true,
    });
    expect(tomato.verifiedAt).not.toBeNull();
    const bread = await recipes.saveIngredient(ctx, chef, location, null, {
      name: 'Bread',
      synonyms: [],
      contains: ['GLUTEN_WHEAT'],
      mayContain: [],
      verified: true,
    });
    breadId = bread.id;
    const soupC = await recipes.saveComponent(ctx, null, {
      name: 'Soup',
      nameNl: 'Soep',
      omittable: false,
      premixed: false,
      suitableForSevere: false,
      ingredientIds: [tomato.id],
      equipmentIds: [],
      childIds: [],
      substitutions: [],
    });
    soupComponentId = soupC.id;
    soupId = (
      await recipes.saveDish(ctx, loc, null, {
        name: 'Tomato soup',
        nameNl: 'Tomatensoep',
        course: 1,
        category: 'Starters',
        subcategory: ' Soups ',
        priceCents: 850,
        componentIds: [soupC.id],
      })
    ).id;
  });

  it('changing the allergens drops the verification', async () => {
    const [tomato] = (await recipes.ingredients(ctx)).filter((i) => i.name === 'Tomato');
    const edited = await recipes.saveIngredient(ctx, chef, location, tomato!.id, {
      name: 'Tomato',
      synonyms: [],
      contains: ['CELERY'],
      mayContain: [],
      verified: false,
    });
    expect(edited.verifiedAt).toBeNull();
    expect(edited.usedIn).toBe(1);
  });

  it('warns before publishing what is unverified, and publishes the draft as version 1', async () => {
    let menu = await recipes.setMenuItems(ctx, loc, [soupId]);
    expect(menu).toMatchObject({ dishIds: [soupId], changed: true, published: null });
    expect(menu.warnings).toEqual([
      expect.objectContaining({ code: 'UNVERIFIED_INGREDIENT', name: 'Tomato' }),
    ]);
    menu = await recipes.publish(ctx, loc, userId);
    expect(menu).toMatchObject({ changed: false, published: { version: 1, dishCount: 1 } });
    expect((await service.getMenu(ctx, loc, 'nl')).dishes).toEqual([
      expect.objectContaining({
        name: 'Tomatensoep',
        course: 1,
        category: 'Starters',
        subcategory: 'Soups',
      }),
    ]);
  });

  it('a recipe edit reaches service only after publishing; orders keep their version', async () => {
    await service.saveSeat(
      ctx,
      loc,
      '1',
      1,
      { allergies: [{ allergen: 'GLUTEN', severity: 'SEVERE' }], noAllergy: false },
      userId,
    );
    // Ordered from version 1: no gluten, so no alert (tomato is unverified: UNKNOWN).
    const before = await service.order(ctx, loc, '1', 1, soupId, userId);
    const plate = before.bySeat[0]!.orders[0]!;
    const v1 = await db.plateOrder.findUniqueOrThrow({ where: { id: plate.id } });
    expect(v1.menuVersionId).not.toBeNull();

    await recipes.saveComponent(ctx, soupComponentId, {
      name: 'Soup',
      nameNl: 'Soep',
      omittable: false,
      premixed: false,
      suitableForSevere: false,
      ingredientIds: [breadId],
      equipmentIds: [],
      childIds: [],
      substitutions: [],
    });
    expect((await recipes.menu(ctx, loc)).changed).toBe(true);
    // Service still has version 1: the soup has no bread yet.
    const live = (await service.getMenu(ctx, loc, 'en')).dishes[0]!;
    expect(live.components[0]!.ingredients.map((i) => i.name)).toEqual(['Tomato']);

    const published = await recipes.publish(ctx, loc, userId);
    expect(published.versions.map((v) => v.version)).toEqual([2, 1]);
    // The open order was placed from version 1 and is still judged with that recipe.
    const alerts = await service.alerts(ctx, loc, 'en', userId);
    expect(alerts.map((a) => a.kind)).toEqual(['unknown']);
    // A new order uses version 2, with bread: do not serve.
    await service.order(ctx, loc, '1', 1, soupId, userId, 'Checked with the chef');
    expect((await service.alerts(ctx, loc, 'en', userId)).map((a) => a.kind)).toEqual([
      'stop',
      'unknown',
    ]);
  });

  it('only dishes on the published menu can be ordered', async () => {
    const offMenu = await recipes.saveDish(ctx, loc, null, {
      name: 'Secret',
      course: 1,
      priceCents: null,
      componentIds: [soupComponentId],
    });
    await expect(service.order(ctx, loc, '1', 2, offMenu.id, userId)).rejects.toThrow();
  });

  it('refuses a component that would contain itself', async () => {
    const outer = await recipes.saveComponent(ctx, null, {
      name: 'Outer',
      omittable: false,
      premixed: false,
      suitableForSevere: false,
      ingredientIds: [],
      equipmentIds: [],
      childIds: [soupComponentId],
      substitutions: [],
    });
    await expect(
      recipes.saveComponent(ctx, soupComponentId, {
        name: 'Soup',
        omittable: false,
        premixed: false,
        suitableForSevere: false,
        ingredientIds: [breadId],
        equipmentIds: [],
        childIds: [outer.id],
        substitutions: [],
      }),
    ).rejects.toThrow();
  });
});
