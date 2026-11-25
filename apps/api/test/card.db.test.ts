/**
 * The allergen card against a migrated database: a PDF from the frozen published version, in
 * the asked language, for staff by version and for guests by slug. Skipped without DATABASE_URL.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/common/prisma.service.js';
import { CardRepository } from '../src/modules/card/card.repository.js';
import { CardService } from '../src/modules/card/card.service.js';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('allergen card', () => {
  const prisma = new PrismaService();
  const db = prisma.system();
  const card = new CardService(new CardRepository(prisma));
  const org = randomUUID();
  const loc = randomUUID();
  const ctx = { organizationId: org, locationIds: [loc] };
  const slug = `c-${loc}`;
  let draft = '';
  let published = '';

  const dish = (name: string) => ({
    kind: 'dish',
    id: randomUUID(),
    name,
    components: [
      {
        id: randomUUID(),
        name: 'Bread',
        omittable: false,
        premixed: false,
        suitableForSevere: false,
        preparedWith: [],
        components: [],
        substitutions: [],
        ingredients: [
          { id: 'i', name: 'Flour', contains: ['GLUTEN_WHEAT'], mayContain: [], verified: true },
        ],
      },
    ],
  });

  beforeAll(async () => {
    await db.organization.create({ data: { id: org, name: 'Test', plan: 'test' } });
    await db.location.create({ data: { id: loc, organizationId: org, name: 'Bistro', slug } });
    const menu = await db.menu.create({ data: { locationId: loc, name: 'Menu' } });
    // Sixty dishes: the card runs over more than one page.
    const many = Array.from({ length: 60 }, (_, i) => dish(`Dish ${i + 1}`));
    const snapshot = {
      dishes: { en: many, nl: many.map((d) => ({ ...d, name: `Gerecht ${d.name}` })) },
    };
    published = (
      await db.menuVersion.create({
        data: {
          menuId: menu.id,
          locationId: loc,
          version: 1,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          snapshot,
        },
      })
    ).id;
    draft = (
      await db.menuVersion.create({
        data: { menuId: menu.id, locationId: loc, version: 2, status: 'DRAFT', snapshot },
      })
    ).id;
  });
  afterAll(() => prisma.onModuleDestroy());

  it('draws the published version as a PDF over several pages', async () => {
    const bytes = await card.forVersion(ctx, loc, published, 'nl');
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toBe('Allergeneninformatie');
  });

  it('has no card for a draft, and guests get the published one by slug', async () => {
    await expect(card.forVersion(ctx, loc, draft, 'en')).rejects.toThrow();
    const doc = await PDFDocument.load(await card.forGuests(slug, 'en'));
    expect(doc.getTitle()).toBe('Allergen information');
    await expect(card.forGuests('nowhere', 'en')).rejects.toThrow();
  });
});
