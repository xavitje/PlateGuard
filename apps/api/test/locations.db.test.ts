/**
 * An owner's locations against a migrated database: the free plan stops at one, a new location
 * gets the owner's PIN and optionally a copy of the menu draft, and nothing reaches another
 * organization. Skipped without DATABASE_URL.
 */
import 'reflect-metadata';
import { hashPin } from '@plateguard/db';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { LocationsRepository } from '../src/modules/setup/locations.repository.js';
import { LocationsService } from '../src/modules/setup/locations.service.js';
import { ProfileRepository } from '../src/modules/setup/profile.repository.js';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('locations of a restaurant', () => {
  const prisma = new PrismaService();
  const db = prisma.system();
  const service = new LocationsService(
    new LocationsRepository(prisma),
    new ProfileRepository(prisma),
    new AuthRepository(prisma),
  );
  const org = randomUUID();
  const loc = randomUUID();
  const owner = randomUUID();
  const otherOrg = randomUUID();
  const otherLoc = randomUUID();
  const here = { id: loc, organizationId: org };
  const ctx = { organizationId: org, locationIds: [loc], userId: owner };
  const profile = { name: 'De Haven Zuid', address: 'Markt 2, Harlingen', photo: '' };

  beforeAll(async () => {
    await db.user.create({ data: { id: owner, name: 'Owner' } });
    await db.organization.createMany({
      data: [
        { id: org, name: 'De Haven', plan: 'free' },
        { id: otherOrg, name: 'Other', plan: 'full' },
      ],
    });
    await db.location.createMany({
      data: [
        { id: loc, organizationId: org, name: 'De Haven', slug: `h-${loc}`, kitchenLocale: 'nl' },
        { id: otherLoc, organizationId: otherOrg, name: 'Other', slug: `o-${otherLoc}` },
      ],
    });
    await db.roleAssignment.create({
      data: { userId: owner, organizationId: org, locationId: null, role: 'OWNER' },
    });
    await db.staffPin.create({
      data: { userId: owner, locationId: loc, pinHash: await hashPin('1234') },
    });
    const component = await db.component.create({ data: { organizationId: org, name: 'Jus' } });
    const dish = await db.dish.create({
      data: { locationId: loc, name: 'Biefstuk', category: 'Hoofdgerechten' },
    });
    await db.dishComponent.create({
      data: { dishId: dish.id, componentId: component.id, locationId: loc },
    });
    await db.dishTranslation.create({
      data: { dishId: dish.id, locale: 'en', locationId: loc, name: 'Steak' },
    });
    const menu = await db.menu.create({ data: { locationId: loc, name: 'Kaart' } });
    await db.menuItem.create({ data: { menuId: menu.id, dishId: dish.id, locationId: loc } });
  });

  afterAll(() => prisma.onModuleDestroy());

  it('lists the one location and the free plan limit', async () => {
    const r = await service.list(ctx, here);
    expect(r).toMatchObject({ plan: 'free', maxLocations: 1 });
    expect(r.locations.map((l) => l.id)).toEqual([loc]);
  });

  it('refuses a second location on the free plan', async () => {
    await expect(service.create(ctx, here, profile)).rejects.toMatchObject({
      response: { code: 'PLAN_LOCATION_LIMIT' },
    });
  });

  it('refuses to copy the menu of another organization', async () => {
    await db.organization.update({ where: { id: org }, data: { plan: 'kitchen' } });
    await expect(
      service.create(ctx, here, { ...profile, copyMenuFrom: otherLoc }),
    ).rejects.toMatchObject({ response: { code: 'LOCATION_NOT_FOUND' } });
  });

  it('adds a location with the settings, the owner PIN and a copy of the menu draft', async () => {
    const r = await service.create(ctx, here, { ...profile, copyMenuFrom: loc });
    expect(r.locations).toHaveLength(2);
    const added = r.locations.find((l) => l.id !== loc)!;
    expect(added).toMatchObject({ name: 'De Haven Zuid', address: 'Markt 2, Harlingen' });
    expect(added.slug).toMatch(/^de-haven-zuid/);

    const row = await db.location.findUniqueOrThrow({ where: { id: added.id } });
    expect([row.organizationId, row.kitchenLocale]).toEqual([org, 'nl']);
    expect(await db.staffPin.count({ where: { userId: owner, locationId: added.id } })).toBe(1);

    const dishes = await db.dish.findMany({
      where: { locationId: added.id },
      include: { components: true, translations: true, menuItems: true },
    });
    expect(dishes).toHaveLength(1);
    expect(dishes[0]).toMatchObject({ name: 'Biefstuk', category: 'Hoofdgerechten' });
    expect(dishes[0]!.components).toHaveLength(1);
    expect(dishes[0]!.translations[0]).toMatchObject({ name: 'Steak', locationId: added.id });
    expect(dishes[0]!.menuItems[0]!.locationId).toBe(added.id);
    // A draft only: guests and service see nothing until someone publishes there.
    expect(await db.menuVersion.count({ where: { locationId: added.id } })).toBe(0);
    // The original is untouched.
    expect(await db.dish.count({ where: { locationId: loc } })).toBe(1);

    const event = await db.auditEvent.findFirstOrThrow({
      where: { organizationId: org, type: 'location.created' },
    });
    expect(event).toMatchObject({ locationId: added.id, actorId: owner });
  });

  it('renames another location of the restaurant, not one of another organization', async () => {
    const other = (await service.list(ctx, here)).locations.find((l) => l.id !== loc)!;
    const r = await service.update(ctx, here, other.id, { ...profile, name: 'Zuid' });
    expect(r.locations.find((l) => l.id === other.id)!.name).toBe('Zuid');
    await expect(service.update(ctx, here, otherLoc, profile)).rejects.toMatchObject({
      response: { code: 'LOCATION_NOT_FOUND' },
    });
    expect((await db.location.findUniqueOrThrow({ where: { id: otherLoc } })).name).toBe('Other');
  });

  it('cannot make a location in another organization, even past the service', async () => {
    const repo = new LocationsRepository(prisma);
    const id = randomUUID();
    await expect(
      repo.create(
        { organizationId: otherOrg, locationIds: [otherLoc, id], userId: owner },
        { id, slug: `x-${id}`, profile, settingsFrom: loc, copyMenuFrom: null, userId: owner },
      ),
    ).rejects.toThrow();
    expect(await db.location.count({ where: { id } })).toBe(0);
  });
});
