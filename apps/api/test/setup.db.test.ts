/**
 * Floor plan and staff against a migrated database. Skipped without DATABASE_URL.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Principal } from '@plateguard/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { FloorplanRepository } from '../src/modules/setup/floorplan.repository.js';
import { FloorplanService } from '../src/modules/setup/floorplan.service.js';
import { StaffRepository } from '../src/modules/setup/staff.repository.js';
import { StaffService } from '../src/modules/setup/staff.service.js';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('floor plan and staff', () => {
  const prisma = new PrismaService();
  const db = prisma.system();
  const floorplan = new FloorplanService(new FloorplanRepository(prisma));
  const staff = new StaffService(new StaffRepository(prisma));
  const auth = new AuthService(new AuthRepository(prisma));
  const org = randomUUID();
  const loc = randomUUID();
  const managerId = randomUUID();
  const ctx = { organizationId: org, locationIds: [loc], userId: managerId };
  const location = { id: loc, organizationId: org };
  const manager: Principal = {
    userId: managerId,
    grants: [{ organizationId: org, locationId: loc, role: 'MANAGER' }],
  };
  const owner: Principal = {
    userId: randomUUID(),
    grants: [{ organizationId: org, locationId: null, role: 'OWNER' }],
  };

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-0123456789';
    await db.organization.create({ data: { id: org, name: 'Test', plan: 'test' } });
    await db.location.create({
      data: { id: loc, organizationId: org, name: 'T', slug: `f-${loc}` },
    });
    await db.user.create({ data: { id: managerId, name: 'Manager' } });
    await db.roleAssignment.create({
      data: { userId: managerId, organizationId: org, locationId: loc, role: 'MANAGER' },
    });
  });

  afterAll(() => prisma.onModuleDestroy());

  it('adds floors and tables, and keeps labels unique', async () => {
    await floorplan.saveFloor(ctx, loc, null, { name: 'Inside', hidden: false });
    let floors = await floorplan.saveFloor(ctx, loc, null, { name: 'Terrace', hidden: false });
    const [inside, terrace] = floors;
    await floorplan.saveTable(ctx, loc, null, {
      floorId: inside!.id,
      label: '1',
      seats: 4,
      shape: 'SQUARE',
      active: true,
    });
    await expect(
      floorplan.saveTable(ctx, loc, null, {
        floorId: terrace!.id,
        label: '1',
        seats: 2,
        shape: 'ROUND',
        active: true,
      }),
    ).rejects.toThrow();
    floors = await floorplan.orderFloors(ctx, loc, [terrace!.id, inside!.id]);
    expect(floors.map((f) => f.name)).toEqual(['Terrace', 'Inside']);
    expect(floors[1]!.tables.map((t) => [t.label, t.seats])).toEqual([['1', 4]]);
  });

  it('will not shrink or remove a table with guests seated', async () => {
    const [, inside] = await floorplan.floors(ctx, loc);
    const table = inside!.tables[0]!;
    const visit = await db.visit.create({
      data: { locationId: loc, servicePointId: table.id, openedById: managerId },
    });
    await db.guest.create({ data: { visitId: visit.id, locationId: loc, seat: 3 } });
    const input = { floorId: inside!.id, label: '1', shape: 'SQUARE' as const, active: true };
    await expect(floorplan.saveTable(ctx, loc, table.id, { ...input, seats: 2 })).rejects.toThrow();
    await expect(
      floorplan.saveTable(ctx, loc, table.id, { ...input, seats: 4, active: false }),
    ).rejects.toThrow();
    const floors = await floorplan.saveTable(ctx, loc, table.id, { ...input, seats: 6 });
    expect(floors[1]!.tables[0]).toMatchObject({ seats: 6, inUse: true });
  });

  it('adds a waiter with a PIN who can then sign in', async () => {
    const list = await staff.create(ctx, manager, location, {
      name: 'Sam',
      roles: ['WAITER'],
      pin: '4321',
    });
    const sam = list.find((m) => m.name === 'Sam')!;
    expect(sam).toMatchObject({ roles: ['WAITER'], hasPin: true, locked: false });
    const login = await auth.loginWithPin({ locationId: loc, userId: sam.id, pin: '4321' });
    expect(login.me.locations[0]?.permissions).toContain('order.create');
  });

  it('only an owner can make someone an owner, and nobody changes their own roles', async () => {
    const sam = (await staff.list(ctx, location)).find((m) => m.name === 'Sam')!;
    await expect(
      staff.update(ctx, manager, location, sam.id, { name: 'Sam', roles: ['OWNER'] }),
    ).rejects.toThrow();
    await expect(
      staff.update(ctx, manager, location, managerId, { name: 'Manager', roles: ['WAITER'] }),
    ).rejects.toThrow();
    const list = await staff.update(ctx, owner, location, sam.id, {
      name: 'Sam',
      roles: ['WAITER', 'RUNNER'],
    });
    expect(list.find((m) => m.id === sam.id)?.roles.sort()).toEqual(['RUNNER', 'WAITER']);
  });

  it('a new PIN unlocks a locked one; removing takes the roles and the PIN', async () => {
    const sam = (await staff.list(ctx, location)).find((m) => m.name === 'Sam')!;
    await db.staffPin.update({
      where: { userId_locationId: { userId: sam.id, locationId: loc } },
      data: { failedTries: 5 },
    });
    expect((await staff.list(ctx, location)).find((m) => m.id === sam.id)?.locked).toBe(true);
    const list = await staff.setPin(ctx, manager, location, sam.id, '9999');
    expect(list.find((m) => m.id === sam.id)?.locked).toBe(false);
    const after = await staff.remove(ctx, manager, location, sam.id);
    expect(after.map((m) => m.name)).toEqual(['Manager']);
  });
});
