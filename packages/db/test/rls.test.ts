/**
 * Proves the database enforces tenant isolation on its own, without help from application code.
 * Needs a migrated database: DATABASE_URL=... pnpm db:migrate && pnpm test:db
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, withTenant } from '../src/index.js';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('row-level security', () => {
  const prisma = new PrismaClient();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const locA1: string = randomUUID();
  const locA2: string = randomUUID();
  const locB: string = randomUUID();
  const userA = randomUUID();

  const ctxA = { organizationId: orgA, locationIds: [locA1, locA2], userId: userA };

  async function seedTenant(orgId: string, locationIds: string[]) {
    await prisma.organization.create({ data: { id: orgId, name: `org ${orgId}`, plan: 'test' } });
    for (const id of locationIds) {
      await prisma.location.create({
        data: { id, organizationId: orgId, name: `loc ${id}`, slug: `t-${id}` },
      });
      const point = await prisma.servicePoint.create({
        data: { locationId: id, label: '12', seats: 4, qrToken: `qr-${id}` },
      });
      const visit = await prisma.visit.create({
        data: { locationId: id, servicePointId: point.id, openedById: userA },
      });
      await prisma.guest.create({ data: { locationId: id, visitId: visit.id, seat: 3 } });
    }
    await prisma.ingredient.create({
      data: { organizationId: orgId, name: 'Flour', contains: ['GLUTEN'] },
    });
    await prisma.auditEvent.create({
      data: {
        organizationId: orgId,
        locationId: locationIds[0],
        type: 'test',
        entity: 'x',
        entityId: '1',
        payload: {},
      },
    });
  }

  beforeAll(async () => {
    await prisma.user.create({ data: { id: userA, name: 'A' } });
    await seedTenant(orgA, [locA1, locA2]);
    await seedTenant(orgB, [locB]);
    await prisma.roleAssignment.create({
      data: { userId: userA, organizationId: orgA, role: 'MANAGER' },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('a tenant sees only its own locations and their rows', async () => {
    const rows = await withTenant(prisma, ctxA, async (tx) => ({
      locations: await tx.location.findMany({ select: { id: true } }),
      guests: await tx.guest.findMany({ select: { locationId: true } }),
      ingredients: await tx.ingredient.findMany({ select: { organizationId: true } }),
      orgs: await tx.organization.findMany({ select: { id: true } }),
    }));
    expect(rows.locations.map((l) => l.id).sort()).toEqual([locA1, locA2].sort());
    expect(rows.guests.every((g) => [locA1, locA2].includes(g.locationId))).toBe(true);
    expect(rows.guests).toHaveLength(2);
    expect(rows.ingredients.every((i) => i.organizationId === orgA)).toBe(true);
    expect(rows.orgs).toEqual([{ id: orgA }]);
  });

  it('a user limited to one location does not see the other location of the same organization', async () => {
    const guests = await withTenant(prisma, { organizationId: orgA, locationIds: [locA1] }, (tx) =>
      tx.guest.findMany({ select: { locationId: true } }),
    );
    expect(guests).toEqual([{ locationId: locA1 }]);
  });

  it('a query without any filter still cannot read another tenant', async () => {
    const found = await withTenant(prisma, ctxA, (tx) =>
      tx.location.findUnique({ where: { id: locB } }),
    );
    expect(found).toBeNull();
  });

  it('refuses to write a row into another tenant', async () => {
    await expect(
      withTenant(prisma, ctxA, (tx) =>
        tx.ingredient.create({ data: { organizationId: orgB, name: 'Smuggled', contains: [] } }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('without tenant settings the app role sees nothing', async () => {
    const count = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE plateguard_app');
      return tx.guest.count();
    });
    expect(count).toBe(0);
  });

  it('shows the shared EU-14 allergens to every tenant but lets no tenant change them', async () => {
    await prisma.allergen.upsert({
      where: { code: 'GLUTEN' },
      update: {},
      create: { code: 'GLUTEN', isEu14: true },
    });
    const gluten = await withTenant(prisma, ctxA, (tx) =>
      tx.allergen.findUnique({ where: { code: 'GLUTEN' } }),
    );
    expect(gluten?.code).toBe('GLUTEN');
    const updated = await withTenant(prisma, ctxA, (tx) =>
      tx.allergen.updateMany({
        where: { code: 'GLUTEN' },
        data: { parentCode: null, isEu14: false },
      }),
    );
    expect(updated.count).toBe(0);
  });

  it('the audit trail is append only, even for the table owner', async () => {
    const row = await prisma.auditEvent.findFirstOrThrow({ where: { organizationId: orgA } });
    await expect(
      prisma.auditEvent.update({ where: { id: row.id }, data: { type: 'tampered' } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.auditEvent.delete({ where: { id: row.id } })).rejects.toThrow(
      /append-only/,
    );
  });

  it('an assessment cannot be changed after it is written', async () => {
    const guest = await prisma.guest.findFirstOrThrow({ where: { locationId: locA1 } });
    const plate = await prisma.plateOrder.create({
      data: {
        locationId: locA1,
        visitId: guest.visitId,
        guestId: guest.id,
        course: 1,
        status: 'ASSESSED',
        qrToken: randomUUID(),
      },
    });
    const assessment = await withTenant(prisma, ctxA, (tx) =>
      tx.assessment.create({
        data: {
          plateId: plate.id,
          locationId: locA1,
          outcome: 'ADAPTABLE',
          reasons: [],
          input: {},
          engineVersion: '0.1.0',
          inputHash: 'x',
        },
      }),
    );
    await expect(
      prisma.assessment.update({ where: { id: assessment.id }, data: { outcome: 'CLEAR' } }),
    ).rejects.toThrow(/append-only/);
  });

  it('stores several custom allergies per guest, each with its own severity', async () => {
    const guest = await prisma.guest.findFirstOrThrow({ where: { locationId: locA2 } });
    await withTenant(prisma, ctxA, (tx) =>
      tx.guestAllergy.createMany({
        data: [
          {
            guestId: guest.id,
            locationId: locA2,
            allergenCode: 'GLUTEN',
            severity: 'SEVERE',
            recordedById: userA,
          },
          {
            guestId: guest.id,
            locationId: locA2,
            customLabel: 'Tomato',
            customKey: 'tomato',
            severity: 'ALLERGY',
            recordedById: userA,
          },
          {
            guestId: guest.id,
            locationId: locA2,
            customLabel: 'Olive oil',
            customKey: 'olive oil',
            severity: 'INTOLERANCE',
            recordedById: userA,
          },
        ],
      }),
    );
    const rows = await prisma.guestAllergy.findMany({ where: { guestId: guest.id } });
    expect(rows).toHaveLength(3);
  });

  it('a guest allergy must be a known allergen or a custom label, not both or neither', async () => {
    const guest = await prisma.guest.findFirstOrThrow({ where: { locationId: locA1 } });
    const base = { guestId: guest.id, locationId: locA1, recordedById: userA };
    await expect(prisma.guestAllergy.create({ data: base })).rejects.toThrow(/known_xor_custom/);
    await expect(
      prisma.guestAllergy.create({
        data: { ...base, allergenCode: 'MILK', customLabel: 'milk', customKey: 'milk' },
      }),
    ).rejects.toThrow(/known_xor_custom/);
  });
});
