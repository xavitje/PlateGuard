/**
 * One person at two locations of a restaurant: brought from one location to the other with
 * their own roles and PIN there, and signing in at either. Skipped without DATABASE_URL.
 */
import 'reflect-metadata';
import type { Principal } from '@plateguard/domain';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { StaffRepository } from '../src/modules/setup/staff.repository.js';
import { StaffService } from '../src/modules/setup/staff.service.js';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('staff at several locations', () => {
  const prisma = new PrismaService();
  const db = prisma.system();
  const staff = new StaffService(new StaffRepository(prisma));
  const auth = new AuthService(new AuthRepository(prisma));
  const org = randomUUID();
  const north = randomUUID();
  const south = randomUUID();
  const otherOrg = randomUUID();
  const otherLoc = randomUUID();
  const managerId = randomUUID();
  const ctx = { organizationId: org, locationIds: [south], userId: managerId };
  const here = { id: south, organizationId: org };
  const manager: Principal = {
    userId: managerId,
    grants: [{ organizationId: org, locationId: south, role: 'MANAGER' }],
  };
  let noor = '';
  let stranger = '';

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-0123456789';
    await db.organization.createMany({
      data: [
        { id: org, name: 'Haven', plan: 'full' },
        { id: otherOrg, name: 'Other', plan: 'full' },
      ],
    });
    await db.location.createMany({
      data: [
        { id: north, organizationId: org, name: 'Noord', slug: `n-${north}` },
        { id: south, organizationId: org, name: 'Zuid', slug: `s-${south}` },
        { id: otherLoc, organizationId: otherOrg, name: 'Elders', slug: `o-${otherLoc}` },
      ],
    });
    await db.user.create({ data: { id: managerId, name: 'Manager' } });
    await db.roleAssignment.create({
      data: { userId: managerId, organizationId: org, locationId: south, role: 'MANAGER' },
    });
    noor = (await db.user.create({ data: { name: 'Noor Visser' } })).id;
    await db.roleAssignment.create({
      data: { userId: noor, organizationId: org, locationId: north, role: 'COOK' },
    });
    stranger = (await db.user.create({ data: { name: 'Stranger' } })).id;
    await db.roleAssignment.create({
      data: { userId: stranger, organizationId: otherOrg, locationId: otherLoc, role: 'COOK' },
    });
  });

  afterAll(() => prisma.onModuleDestroy());

  it('offers the people of the other locations, not those of another restaurant', async () => {
    expect(await staff.candidates(ctx, here)).toEqual([
      { id: noor, name: 'Noor Visser', locations: ['Noord'] },
    ]);
  });

  it('brings Noor here as a waiter with a PIN of her own here', async () => {
    const list = await staff.link(ctx, manager, here, noor, { roles: ['WAITER'], pin: '4321' });
    expect(list.find((m) => m.id === noor)).toMatchObject({
      roles: ['WAITER'],
      orgRoles: [],
      hasPin: true,
      elsewhere: ['Noord'],
    });
    // Still a cook up north: the roles here are added, not moved.
    expect(
      await db.roleAssignment.count({ where: { userId: noor, locationId: north, role: 'COOK' } }),
    ).toBe(1);
    expect(await staff.candidates(ctx, here)).toEqual([]);

    const session = await auth.loginWithPin({ locationId: south, name: 'Noor', pin: '4321' });
    expect(session.me.locations.map((l) => l.id)).toEqual([south]);
    expect(session.me.locations[0]!.permissions).toContain('order.create');
    expect(session.me.locations[0]!.permissions).not.toContain('plate.check');
  });

  it('refuses someone of another restaurant, and someone already here', async () => {
    await expect(
      staff.link(ctx, manager, here, stranger, { roles: ['WAITER'], pin: '1111' }),
    ).rejects.toMatchObject({ response: { code: 'STAFF_NOT_FOUND' } });
    await expect(
      staff.link(ctx, manager, here, noor, { roles: ['RUNNER'], pin: '2222' }),
    ).rejects.toMatchObject({ response: { code: 'STAFF_NOT_FOUND' } });
    expect(
      await db.roleAssignment.count({ where: { userId: stranger, organizationId: org } }),
    ).toBe(0);
  });

  it('refuses a PIN a same first name already has here', async () => {
    const other = (await db.user.create({ data: { name: 'Noor Bakker' } })).id;
    await db.roleAssignment.create({
      data: { userId: other, organizationId: org, locationId: north, role: 'RUNNER' },
    });
    await expect(
      staff.link(ctx, manager, here, other, { roles: ['RUNNER'], pin: '4321' }),
    ).rejects.toMatchObject({ response: { code: 'PIN_TAKEN' } });
  });

  it('a manager cannot bring someone in as owner', async () => {
    const other = (await db.user.create({ data: { name: 'Bram' } })).id;
    await db.roleAssignment.create({
      data: { userId: other, organizationId: org, locationId: north, role: 'COOK' },
    });
    await expect(
      staff.link(ctx, manager, here, other, { roles: ['OWNER'], pin: '9999' }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });
});
