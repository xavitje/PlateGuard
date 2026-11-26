/**
 * The restaurant profile against a migrated database: saved under row-level security, logged
 * without the photo, and out of reach of another organization. Skipped without DATABASE_URL.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { ProfileRepository } from '../src/modules/setup/profile.repository.js';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('restaurant profile', () => {
  const prisma = new PrismaService();
  const db = prisma.system();
  const repo = new ProfileRepository(prisma);
  const org = randomUUID();
  const loc = randomUUID();
  const user = randomUUID();
  const ctx = { organizationId: org, locationIds: [loc], userId: user };
  const photo = 'data:image/jpeg;base64,/9j/4A==';

  beforeAll(async () => {
    await db.user.create({ data: { id: user, name: 'Owner' } });
    await db.organization.create({ data: { id: org, name: 'Test', plan: 'test' } });
    await db.location.create({
      data: { id: loc, organizationId: org, name: 'Old name', slug: `p-${loc}` },
    });
  });

  afterAll(() => prisma.onModuleDestroy());

  it('starts empty, saves name, address and photo, and logs the change without the photo', async () => {
    expect(await repo.get(ctx, loc)).toEqual({ name: 'Old name', address: '', photo: '' });
    const next = { name: 'De Haven', address: 'Kade 1, Harlingen', photo };
    await repo.save(ctx, loc, next);
    expect(await repo.get(ctx, loc)).toEqual(next);
    const event = await db.auditEvent.findFirstOrThrow({
      where: { organizationId: org, type: 'location.profile_set' },
    });
    expect(event.payload).toEqual({ name: 'De Haven', address: 'Kade 1, Harlingen', photo: true });
  });

  it('clears the address and photo with empty strings', async () => {
    await repo.save(ctx, loc, { name: 'De Haven', address: '', photo: '' });
    const row = await db.location.findUniqueOrThrow({ where: { id: loc } });
    expect([row.address, row.photo]).toEqual([null, null]);
  });

  it('cannot change a location of another organization', async () => {
    const other = { organizationId: randomUUID(), locationIds: [loc], userId: user };
    await expect(
      repo.save(other, loc, { name: 'Stolen', address: '', photo: '' }),
    ).rejects.toThrow();
    expect((await db.location.findUniqueOrThrow({ where: { id: loc } })).name).toBe('De Haven');
  });
});
