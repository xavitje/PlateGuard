import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { hashPassword, withTenant } from '@plateguard/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import {
  issuePlatformToken,
  issueToken,
  readPlatformToken,
  readToken,
} from '../src/modules/auth/token.js';
import { PlatformRepository } from '../src/modules/platform/platform.repository.js';
import { MAX_PLATFORM_TRIES, PlatformService } from '../src/modules/platform/platform.service.js';
import {
  base32,
  matchTotp,
  newTotpSecret,
  totpCode,
  totpStep,
  unbase32,
} from '../src/modules/platform/totp.js';

process.env.JWT_SECRET ??= 'test-secret-at-least-16';

describe('authenticator codes', () => {
  it('matches the RFC 6238 test values', () => {
    const secret = base32(Buffer.from('12345678901234567890'));
    expect(totpCode(secret, totpStep(59_000))).toBe('287082');
    expect(totpCode(secret, totpStep(1_111_111_109_000))).toBe('081804');
    expect(unbase32(secret).toString()).toBe('12345678901234567890');
  });

  it('accepts one step of clock drift, nothing further', () => {
    const secret = newTotpSecret();
    const now = Date.UTC(2026, 10, 26, 10);
    const step = totpStep(now);
    expect(matchTotp(secret, totpCode(secret, step - 1), now)).toBe(step - 1);
    expect(matchTotp(secret, totpCode(secret, step + 1), now)).toBe(step + 1);
    expect(matchTotp(secret, totpCode(secret, step - 3), now)).toBeNull();
  });
});

describe('platform and shift sessions stay apart', () => {
  it('a platform token opens no restaurant route, a shift token no platform route', () => {
    const platform = issuePlatformToken('admin-1').token;
    const shift = issueToken({ sub: 'u1', loc: 'l1' }).token;
    expect(readPlatformToken(platform)).toMatchObject({ sub: 'admin-1', aud: 'platform' });
    expect(readToken(platform)).toBeNull();
    expect(readPlatformToken(shift)).toBeNull();
    expect(readToken(shift)).toMatchObject({ sub: 'u1' });
  });
});

describe.skipIf(!process.env.DATABASE_URL)('platform login', () => {
  const prisma = new PrismaService();
  const platform = new PlatformService(new PlatformRepository(prisma));
  const email = `admin-${randomUUID().slice(0, 8)}@example.com`;
  const password = 'correct horse battery';
  const secret = newTotpSecret();
  let now = Date.UTC(2026, 10, 26, 10);
  const code = () => totpCode(secret, totpStep(now));

  beforeAll(async () => {
    await prisma.system().platformAdmin.create({
      data: { email, passwordHash: await hashPassword(password), totpSecret: secret },
    });
  });
  afterAll(async () => {
    await prisma.system().platformAdmin.delete({ where: { email } });
    await prisma.onModuleDestroy();
  });

  it('signs in with email, password and code, and a code works once', async () => {
    const res = await platform.login({ email, password, code: code() }, now);
    expect(res.me).toEqual({ email });
    expect(readPlatformToken(res.token, now)).toMatchObject({ aud: 'platform' });
    await expect(platform.login({ email, password, code: code() }, now)).rejects.toMatchObject({
      status: 401,
      response: { code: 'LOGIN_INVALID' },
    });
  });

  it('never says which part was wrong, and locks after five failures', async () => {
    now += 60_000;
    await expect(
      platform.login({ email: 'nobody@example.com', password, code: code() }, now),
    ).rejects.toMatchObject({ status: 401, response: { code: 'LOGIN_INVALID' } });
    // The reused code above was the first failure.
    for (let i = 2; i < MAX_PLATFORM_TRIES; i++) {
      await expect(
        platform.login({ email, password: 'wrong password!', code: code() }, now),
      ).rejects.toMatchObject({ status: 401, response: { code: 'LOGIN_INVALID' } });
    }
    await expect(platform.login({ email, password, code: '000000' }, now)).rejects.toMatchObject({
      status: 423,
    });
    // Locked: even everything right waits, until the quarter of an hour is over.
    await expect(platform.login({ email, password, code: code() }, now)).rejects.toMatchObject({
      status: 423,
    });
    now += 16 * 60_000;
    expect((await platform.login({ email, password, code: code() }, now)).me).toEqual({ email });
  });

  it('counts every one of many parallel tries, so they cannot share one count', async () => {
    const other = `admin-${randomUUID().slice(0, 8)}@example.com`;
    await prisma.system().platformAdmin.create({
      data: { email: other, passwordHash: await hashPassword(password), totpSecret: secret },
    });
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, () =>
          platform.login({ email: other, password: 'wrong password!', code: code() }, now),
        ),
      );
      const status = results.map((r) => (r.status === 'rejected' ? r.reason.status : 200));
      expect(status.filter((s) => s === 401)).toHaveLength(MAX_PLATFORM_TRIES - 1);
      expect(status.filter((s) => s === 423)).toHaveLength(12 - (MAX_PLATFORM_TRIES - 1));
      await expect(
        platform.login({ email: other, password, code: code() }, now),
      ).rejects.toMatchObject({ status: 423 });
    } finally {
      await prisma.system().platformAdmin.delete({ where: { email: other } });
    }
  });

  it('resets a forgotten password with the code, under the same lockout', async () => {
    now += 60_000;
    const next = 'a brand new password';
    await expect(
      platform.resetPassword({ email, code: '000000', password: next }, now),
    ).rejects.toMatchObject({ status: 401 });
    const res = await platform.resetPassword({ email, code: code(), password: next }, now);
    expect(res.me).toEqual({ email });
    now += 60_000;
    await expect(platform.login({ email, password, code: code() }, now)).rejects.toMatchObject({
      status: 401,
    });
    now += 60_000;
    expect((await platform.login({ email, password: next, code: code() }, now)).me).toEqual({
      email,
    });
  });

  it('is out of reach of every restaurant query', async () => {
    const ctx = { organizationId: randomUUID(), locationIds: [randomUUID()] };
    await expect(
      withTenant(prisma.system(), ctx, (tx) => tx.platformAdmin.count()),
    ).rejects.toThrow(/permission denied/);
  });
});
