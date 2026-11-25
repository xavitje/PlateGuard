import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { hashPin, verifyPin } from '@plateguard/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService, MAX_PIN_TRIES } from '../src/modules/auth/auth.service.js';
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
});
