/**
 * Seeds the EU-14 allergens with their subtypes (English and Dutch), and a demo location.
 * The demo data is invented: Brasserie De Haven does not exist.
 *
 * Run as the table owner: pnpm db:seed
 */
import { PrismaClient } from '@prisma/client';
import { ALLERGEN_NAMES } from './seed-data/allergens.js';

const prisma = new PrismaClient();

const DEMO_ORG = '00000000-0000-4000-8000-000000000001';
const DEMO_LOCATION = '00000000-0000-4000-8000-000000000010';
const DEMO_OWNER = '00000000-0000-4000-8000-000000000100';

async function seedAllergens() {
  // Parents first, so subtypes can reference them.
  const ordered = [...ALLERGEN_NAMES].sort((a, b) => Number(!!a.parent) - Number(!!b.parent));
  for (const a of ordered) {
    await prisma.allergen.upsert({
      where: { code: a.code },
      update: { parentCode: a.parent ?? null, isEu14: true },
      create: { code: a.code, parentCode: a.parent ?? null, isEu14: true },
    });
    for (const [locale, name] of Object.entries(a.names)) {
      await prisma.allergenTranslation.upsert({
        where: { allergenCode_locale: { allergenCode: a.code, locale } },
        update: { name },
        create: { allergenCode: a.code, locale, name },
      });
    }
  }
}

async function seedDemo() {
  await prisma.organization.upsert({
    where: { id: DEMO_ORG },
    update: {},
    create: { id: DEMO_ORG, name: 'Brasserie De Haven (demo)', plan: 'pilot' },
  });
  await prisma.location.upsert({
    where: { id: DEMO_LOCATION },
    update: {},
    create: {
      id: DEMO_LOCATION,
      organizationId: DEMO_ORG,
      name: 'Brasserie De Haven',
      slug: 'de-haven-demo',
      level: 'STANDARD',
      defaultLocale: 'nl',
      kitchenLocale: 'nl',
    },
  });
  await prisma.user.upsert({
    where: { id: DEMO_OWNER },
    update: {},
    create: { id: DEMO_OWNER, name: 'Demo Owner', email: 'owner@example.com', locale: 'en' },
  });
  const existingRole = await prisma.roleAssignment.findFirst({
    where: { userId: DEMO_OWNER, organizationId: DEMO_ORG, role: 'OWNER' },
  });
  if (!existingRole) {
    await prisma.roleAssignment.create({
      data: { userId: DEMO_OWNER, organizationId: DEMO_ORG, locationId: null, role: 'OWNER' },
    });
  }

  if ((await prisma.floor.count({ where: { locationId: DEMO_LOCATION } })) > 0) return;

  const floors = [
    { name: 'Inside', tables: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] },
    { name: 'Terrace', tables: ['10', '11', '12'] },
  ];
  for (const [sortOrder, f] of floors.entries()) {
    const floor = await prisma.floor.create({
      data: { locationId: DEMO_LOCATION, name: f.name, sortOrder, versionStatus: 'PUBLISHED' },
    });
    for (const [i, label] of f.tables.entries()) {
      await prisma.servicePoint.create({
        data: {
          locationId: DEMO_LOCATION,
          floorId: floor.id,
          label,
          seats: i % 3 === 0 ? 2 : 4,
          shape: i % 3 === 0 ? 'ROUND' : 'SQUARE',
          x: 8 + (i % 3) * 30,
          y: 8 + Math.floor(i / 3) * 30,
          w: 18,
          h: 18,
          qrToken: `demo-${label}`,
        },
      });
    }
  }

  // A small recipe: steak with a jus bound with wheat flour, and fries from a shared fryer.
  const org = { organizationId: DEMO_ORG };
  const flour = await prisma.ingredient.create({
    data: {
      ...org,
      name: 'Wheat flour',
      contains: ['GLUTEN_WHEAT'],
      verifiedAt: new Date(),
      verifiedSource: 'demo',
    },
  });
  const stock = await prisma.ingredient.create({
    data: {
      ...org,
      name: 'Veal stock',
      contains: ['CELERY'],
      verifiedAt: new Date(),
      verifiedSource: 'demo',
    },
  });
  const cornstarch = await prisma.ingredient.create({
    data: { ...org, name: 'Corn starch', verifiedAt: new Date(), verifiedSource: 'demo' },
  });
  const potato = await prisma.ingredient.create({
    data: { ...org, name: 'Potato', verifiedAt: new Date(), verifiedSource: 'demo' },
  });
  const fryer = await prisma.equipment.create({
    data: { ...org, name: 'Fryer 1', allergens: ['FISH', 'CRUSTACEANS'] },
  });

  const jus = await prisma.component.create({ data: { ...org, name: 'Jus' } });
  const gfJus = await prisma.component.create({
    data: { ...org, name: 'Gluten-free jus', suitableForSevere: true },
  });
  const fries = await prisma.component.create({ data: { ...org, name: 'Fries', omittable: true } });
  await prisma.componentIngredient.createMany({
    data: [
      { ...org, componentId: jus.id, ingredientId: flour.id },
      { ...org, componentId: jus.id, ingredientId: stock.id },
      { ...org, componentId: gfJus.id, ingredientId: cornstarch.id },
      { ...org, componentId: gfJus.id, ingredientId: stock.id },
      { ...org, componentId: fries.id, ingredientId: potato.id },
    ],
  });
  await prisma.componentEquipment.create({
    data: { ...org, componentId: fries.id, equipmentId: fryer.id },
  });
  await prisma.substitution.create({
    data: { ...org, componentId: jus.id, replacementId: gfJus.id, suitableForSevere: true },
  });

  const steak = await prisma.dish.create({
    data: {
      locationId: DEMO_LOCATION,
      name: 'Steak with jus and fries',
      course: 2,
      priceCents: 2650,
    },
  });
  await prisma.dishComponent.createMany({
    data: [
      { locationId: DEMO_LOCATION, dishId: steak.id, componentId: jus.id, sortOrder: 0 },
      { locationId: DEMO_LOCATION, dishId: steak.id, componentId: fries.id, sortOrder: 1 },
    ],
  });
  await prisma.dishTranslation.createMany({
    data: [
      {
        locationId: DEMO_LOCATION,
        dishId: steak.id,
        locale: 'en',
        name: 'Steak with jus and fries',
      },
      {
        locationId: DEMO_LOCATION,
        dishId: steak.id,
        locale: 'nl',
        name: 'Biefstuk met jus en friet',
      },
    ],
  });
}

async function main() {
  await seedAllergens();
  if (process.env.SEED_DEMO !== 'false') await seedDemo();
  console.log('Seed complete');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
