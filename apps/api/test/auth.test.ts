import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { hashPin, verifyPin } from '@plateguard/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService, MAX_PIN_TRIES, slugify } from '../src/modules/auth/auth.service.js';
import { issueToken, readToken, SESSION_SECONDS } from '../src/modules/auth/token.js';

process.env.JWT_SECRET ??= 'test-secret-at-least-16';

describe('session tokens', () => {
  it('round-trips the claims until the shift ends', () => {
    const now = Date.UTC(2026, 10, 25, 9);
    const { token } = issueToken({ sub: 'u1', loc: 'l1' }, now);
    expect(readToken(token, now + 1000)).toMatchObject({ sub: 'u1', loc: 'l1' });
    expect(readToken(token, now + SESSION_SECONDS * 1000 + 1)).toBeNull();
  });

  it('refuses a token with a changed payload or signature', () => {
    const { token } = issueToken({ sub: 'u1', loc: 'l1' });
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'owner', loc: 'l1', exp: 9e9 })).toString(
      'base64url',
    );
    expect(readToken(`${h}.${forged}.${s}`)).toBeNull();
    expect(readToken(`${token}x`)).toBeNull();
    expect(readToken('not-a-token')).toBeNull();
  });
});

describe('PIN hashes', () => {
  it('verifies the right PIN only, with a salt per hash', async () => {
    const a = await hashPin('1234');
    expect(await verifyPin('1234', a)).toBe(true);
    expect(await verifyPin('4321', a)).toBe(false);
    expect(await hashPin('1234')).not.toBe(a);
    await expect(hashPin('12')).rejects.toThrow();
  });
});

describe('guest menu address from the restaurant name', () => {
  it('keeps letters and digits, drops accents and signs', () => {
    expect(slugify("Café 't Hoekje")).toBe('cafe-t-hoekje');
    expect(slugify('  Brasserie   De Haven 2 ')).toBe('brasserie-de-haven-2');
    expect(slugify('***')).toBe('restaurant');
  });
});

describe.skipIf(!process.env.DATABASE_URL)('free start', () => {
  const prisma = new PrismaService();
  const auth = new AuthService(new AuthRepository(prisma));
  const tag = randomUUID().slice(0, 8);
  afterAll(() => prisma.onModuleDestroy());

  it('makes the restaurant on the free plan and signs the owner in there', async () => {
    const email = `owner-${tag}@example.com`;
    const res = await auth.signup({
      restaurant: `Bistro ${tag}`,
      name: 'Rafi',
      email,
      pin: '4826',
    });
    const here = res.me.locations[0]!;
    expect(here.slug).toBe(`bistro-${tag}`);
    expect(here.permissions).toEqual(expect.arrayContaining(['menu.edit', 'menu.publish']));
    expect(readToken(res.token)).toMatchObject({ loc: here.id });
    const org = await prisma
      .system()
      .organization.findUnique({ where: { id: here.organizationId } });
    expect(org?.plan).toBe('free');
    const again = await auth.loginWithPin({ locationId: here.id, name: 'rafi', pin: '4826' });
    expect(again.me.user.id).toBe(res.me.user.id);

    const second = await auth.signup({
      restaurant: `Bistro ${tag}`,
      name: 'Sam',
      email: `other-${tag}@example.com`,
      pin: '1111',
    });
    expect(second.me.locations[0]?.slug).toBe(`bistro-${tag}-2`);
    await expect(
      auth.signup({ restaurant: 'X', name: 'Kim', email, pin: '1111' }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'EMAIL_TAKEN' } });
  });
});

describe.skipIf(!process.env.DATABASE_URL)('PIN login', () => {
  const prisma = new PrismaService();
  const db = prisma.system();
  const auth = new AuthService(new AuthRepository(prisma));
  const org = randomUUID();
  const loc: string = randomUUID();
  const other: string = randomUUID();
  const waiter: string = randomUUID();
  const slug = `pin-${loc}`;

  beforeAll(async () => {
    await db.organization.create({ data: { id: org, name: 'Test', plan: 'test' } });
    await db.location.create({ data: { id: loc, organizationId: org, name: 'Front', slug } });
    await db.location.create({
      data: { id: other, organizationId: org, name: 'Other', slug: `pin-${other}` },
    });
    await db.user.create({ data: { id: waiter, name: 'Sam' } });
    await db.roleAssignment.create({
      data: { userId: waiter, organizationId: org, locationId: loc, role: 'WAITER' },
    });
    await db.staffPin.create({
      data: { userId: waiter, locationId: loc, pinHash: await hashPin('1234') },
    });
  });
  afterAll(() => prisma.onModuleDestroy());

  it('shows the location on the sign-in screen, without names', async () => {
    expect(await auth.signInLocation(slug)).toEqual({
      location: { id: loc, name: 'Front' },
      hasStaff: true,
    });
  });

  it('signs in with first name and PIN, bound to that location', async () => {
    const res = await auth.loginWithPin({ locationId: loc, name: ' sám ', pin: '1234' });
    expect(readToken(res.token)).toMatchObject({ sub: waiter, loc });
    expect(res.me.locations.map((l) => l.id)).toEqual([loc]);
    expect(res.me.locations[0]?.permissions).toContain('order.create');
  });

  it('does not know the name, or has no PIN on a location without one', async () => {
    await expect(
      auth.loginWithPin({ locationId: loc, name: 'Kim', pin: '1234' }),
    ).rejects.toMatchObject({ status: 401, response: { code: 'NAME_UNKNOWN' } });
    await expect(
      auth.loginWithPin({ locationId: other, name: 'Sam', pin: '1234' }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('compares the PIN with this location only, never with every restaurant', async () => {
    await db.roleAssignment.create({
      data: { userId: waiter, organizationId: org, locationId: other, role: 'WAITER' },
    });
    await db.staffPin.create({
      data: { userId: waiter, locationId: other, pinHash: await hashPin('9999') },
    });
    // Sam's PIN of the other location does not open this one, and costs nothing there.
    await expect(
      auth.loginWithPin({ locationId: loc, name: 'Sam', pin: '9999' }),
    ).rejects.toMatchObject({ status: 401 });
    const there = await db.staffPin.findUniqueOrThrow({
      where: { userId_locationId: { userId: waiter, locationId: other } },
    });
    expect(there.failedTries).toBe(0);
    const res = await auth.loginWithPin({ locationId: other, name: 'Sam', pin: '9999' });
    expect(res.me.locations.map((l) => l.id)).toEqual([other]);
    await db.staffPin.delete({
      where: { userId_locationId: { userId: waiter, locationId: other } },
    });
    await db.staffPin.update({
      where: { userId_locationId: { userId: waiter, locationId: loc } },
      data: { failedTries: 0 },
    });
  });

  it('locks the PIN after five wrong tries, even for the right PIN after', async () => {
    for (let i = 1; i < MAX_PIN_TRIES; i++) {
      await expect(
        auth.loginWithPin({ locationId: loc, name: 'Sam', pin: '0000' }),
      ).rejects.toMatchObject({ status: 401 });
    }
    await expect(
      auth.loginWithPin({ locationId: loc, name: 'Sam', pin: '0000' }),
    ).rejects.toMatchObject({ status: 423 });
    await expect(
      auth.loginWithPin({ locationId: loc, name: 'Sam', pin: '1234' }),
    ).rejects.toMatchObject({ status: 423 });
  });

  it('names the other locations someone works at, to sign in there', async () => {
    const kim = (await db.user.create({ data: { name: 'Kim' } })).id;
    await db.roleAssignment.createMany({
      data: [
        { userId: kim, organizationId: org, locationId: loc, role: 'COOK' },
        { userId: kim, organizationId: org, locationId: other, role: 'WAITER' },
      ],
    });
    await db.staffPin.create({
      data: { userId: kim, locationId: loc, pinHash: await hashPin('5678') },
    });
    const res = await auth.loginWithPin({ locationId: loc, name: 'Kim', pin: '5678' });
    expect(res.me.locations.map((l) => l.id)).toEqual([loc]);
    expect(res.me.elsewhere).toEqual([{ id: other, name: 'Other', slug: `pin-${other}` }]);
  });

  it('counts every one of many parallel guesses, so they cannot share one try', async () => {
    const lex = (await db.user.create({ data: { name: 'Lex' } })).id;
    await db.roleAssignment.create({
      data: { userId: lex, organizationId: org, locationId: loc, role: 'WAITER' },
    });
    await db.staffPin.create({
      data: { userId: lex, locationId: loc, pinHash: await hashPin('4321') },
    });
    const guesses = Array.from({ length: 20 }, (_, i) => String(1000 + i));
    const results = await Promise.allSettled(
      guesses.map((pin) => auth.loginWithPin({ locationId: loc, name: 'Lex', pin })),
    );
    const status = results.map((r) => (r.status === 'rejected' ? r.reason.status : 200));
    expect(status.filter((s) => s === 401)).toHaveLength(MAX_PIN_TRIES - 1);
    expect(status.filter((s) => s === 423)).toHaveLength(20 - (MAX_PIN_TRIES - 1));
    await expect(
      auth.loginWithPin({ locationId: loc, name: 'Lex', pin: '4321' }),
    ).rejects.toMatchObject({ status: 423 });
    const row = await db.staffPin.findUniqueOrThrow({
      where: { userId_locationId: { userId: lex, locationId: loc } },
    });
    expect(row.failedTries).toBe(MAX_PIN_TRIES);
  });

  it('does not count the right PIN as a wrong try for someone with the same first name', async () => {
    const [a, b] = await Promise.all([
      db.user.create({ data: { name: 'Noa Smit' } }),
      db.user.create({ data: { name: 'Noa Bos' } }),
    ]);
    for (const [u, pin] of [
      [a.id, '1111'],
      [b.id, '2222'],
    ] as const) {
      await db.roleAssignment.create({
        data: { userId: u, organizationId: org, locationId: other, role: 'WAITER' },
      });
      await db.staffPin.create({
        data: { userId: u, locationId: other, pinHash: await hashPin(pin) },
      });
    }
    await auth.loginWithPin({ locationId: other, name: 'Noa', pin: '1111' });
    const rows = await db.staffPin.findMany({
      where: { locationId: other, userId: { in: [a.id, b.id] } },
    });
    expect(rows.map((r) => r.failedTries)).toEqual([0, 0]);
  });
});
