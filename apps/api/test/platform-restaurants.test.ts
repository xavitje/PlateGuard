import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService, MAX_PIN_TRIES } from '../src/modules/auth/auth.service.js';
import { issuePlatformToken, issueToken } from '../src/modules/auth/token.js';
import { PlatformGuard } from '../src/modules/platform/platform.guard.js';
import { lastWeeks, PlatformRepository } from '../src/modules/platform/platform.repository.js';
import { RestaurantsService } from '../src/modules/platform/restaurants.service.js';
import { StaffRepository } from '../src/modules/setup/staff.repository.js';

process.env.JWT_SECRET ??= 'test-secret-at-least-16';

describe('platform guard', () => {
  const admin = { id: randomUUID(), email: 'rafi@example.com' };
  const repo = { findById: async (id: string) => (id === admin.id ? admin : null) };
  const guard = new PlatformGuard(repo as unknown as PlatformRepository);
  const ctx = (authorization?: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
    }) as unknown as ExecutionContext;

  it('lets a platform token in, and refuses a restaurant shift token or none', async () => {
    await expect(
      guard.canActivate(ctx(`Bearer ${issuePlatformToken(admin.id).token}`)),
    ).resolves.toBe(true);
    const shift = issueToken({ sub: admin.id, loc: randomUUID() }).token;
    await expect(guard.canActivate(ctx(`Bearer ${shift}`))).rejects.toMatchObject({
      status: 401,
    });
    await expect(guard.canActivate(ctx())).rejects.toMatchObject({ status: 401 });
    await expect(
      guard.canActivate(ctx(`Bearer ${issuePlatformToken(randomUUID()).token}`)),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('weeks in the stats', () => {
  it('are the last Mondays, this week last', () => {
    // Wednesday 26 November 2026.
    expect(lastWeeks(new Date(Date.UTC(2026, 10, 26, 22)), 3)).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
    ]);
    expect(lastWeeks(new Date(Date.UTC(2026, 10, 23)), 1)).toEqual(['2026-11-23']);
    expect(lastWeeks(new Date(Date.UTC(2026, 10, 29, 23)), 1)).toEqual(['2026-11-23']);
  });
});

describe.skipIf(!process.env.DATABASE_URL)('restaurants on request', () => {
  const prisma = new PrismaService();
  const authRepo = new AuthRepository(prisma);
  const auth = new AuthService(authRepo);
  const platform = new RestaurantsService(
    new PlatformRepository(prisma),
    authRepo,
    new StaffRepository(prisma),
  );
  const tag = randomUUID().slice(0, 8);
  const admin = 'rafi@example.com';
  afterAll(() => prisma.onModuleDestroy());

  it('makes a restaurant, sets its plan, adds people and resets a PIN, all audited', async () => {
    const list = await platform.create(admin, {
      restaurant: `Trattoria ${tag}`,
      name: 'Gina',
      email: `gina-${tag}@example.com`,
      pin: '2468',
      plan: 'kitchen',
    });
    const made = list.find((r) => r.name === `Trattoria ${tag}`)!;
    expect(made).toMatchObject({ plan: 'kitchen', ownerEmail: `gina-${tag}@example.com` });
    const loc = made.locations[0]!;
    expect(loc).toMatchObject({ slug: `trattoria-${tag}`, staff: 1 });
    // The owner signs in there with first name and PIN, like after the free start.
    const owner = await auth.loginWithPin({ locationId: loc.id, name: 'Gina', pin: '2468' });
    expect(owner.me.locations[0]?.permissions).toContain('menu.publish');

    const free = await platform.setPlan(admin, made.id, 'free');
    expect(free.find((r) => r.id === made.id)?.plan).toBe('free');

    const staff = await platform.addStaff(admin, loc.id, {
      name: 'Luca',
      roles: ['WAITER'],
      pin: '1357',
    });
    const luca = staff.find((m) => m.name === 'Luca')!;
    expect(luca).toMatchObject({ roles: ['WAITER'], hasPin: true });
    await expect(
      platform.addStaff(admin, loc.id, { name: 'luca', roles: ['COOK'], pin: '1357' }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'PIN_TAKEN' } });

    for (let i = 0; i < MAX_PIN_TRIES; i++)
      await auth.loginWithPin({ locationId: loc.id, name: 'Luca', pin: '0000' }).catch(() => {});
    expect((await platform.staffOf(loc.id)).find((m) => m.id === luca.id)?.locked).toBe(true);
    const unlocked = await platform.setPin(admin, loc.id, luca.id, '8642');
    expect(unlocked.find((m) => m.id === luca.id)?.locked).toBe(false);
    await expect(
      auth.loginWithPin({ locationId: loc.id, name: 'Luca', pin: '8642' }),
    ).resolves.toBeTruthy();

    const events = await prisma.system().auditEvent.findMany({
      where: { organizationId: made.id },
      orderBy: { id: 'asc' },
    });
    expect(events.map((e) => e.type)).toEqual([
      'platform.restaurant.created',
      'platform.plan.changed',
      'platform.staff.added',
      'platform.pin.reset',
    ]);
    expect(
      events.every((e) => (e.payload as { platformAdmin?: string }).platformAdmin === admin),
    ).toBe(true);
  });

  it('counts across the app: restaurants, plans and sign-ups this week', async () => {
    const before = await platform.stats();
    await platform.create(admin, {
      restaurant: `Stats ${tag}`,
      name: 'Noor',
      email: `noor-${tag}@example.com`,
      pin: '1593',
      plan: 'full',
    });
    const after = await platform.stats();
    expect(after.restaurants).toBe(before.restaurants + 1);
    expect(after.locations).toBe(before.locations + 1);
    expect(after.byPlan.full).toBe((before.byPlan.full ?? 0) + 1);
    expect(after.weeks).toHaveLength(8);
    expect(after.weeks.at(-1)!.signups).toBe(before.weeks.at(-1)!.signups + 1);
    expect(after.weeks.at(-1)!.week).toBe(lastWeeks(new Date(), 1)[0]);
    const row = (await platform.list()).find((r) => r.name === `Stats ${tag}`);
    expect(row).toMatchObject({ plates30: 0, lastActivity: null });
  });

  it('refuses an unknown restaurant, location or person', async () => {
    await expect(platform.setPlan(admin, randomUUID(), 'kitchen')).rejects.toMatchObject({
      status: 404,
    });
    await expect(platform.staffOf(randomUUID())).rejects.toMatchObject({ status: 404 });
    const someLocation = (await platform.list())[0]?.locations[0];
    if (someLocation)
      await expect(
        platform.setPin(admin, someLocation.id, randomUUID(), '1234'),
      ).rejects.toMatchObject({ status: 404 });
  });
});
