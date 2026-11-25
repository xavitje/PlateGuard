/**
 * Seeds the EU-14 allergens with their subtypes (English and Dutch), and a demo location.
 * The demo data is invented: Brasserie De Haven does not exist.
 *
 * Run as the table owner: pnpm db:seed
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { assess, type GuestAllergy } from '@plateguard/domain';
import { loadDishes } from '../src/menu.js';
import { hashPin } from '../src/pin.js';
import { ALLERGEN_NAMES } from './seed-data/allergens.js';

const prisma = new PrismaClient();

const DEMO_ORG = '00000000-0000-4000-8000-000000000001';
const DEMO_LOCATION = '00000000-0000-4000-8000-000000000010';
const DEMO_OWNER = '00000000-0000-4000-8000-000000000100';
const DEMO_WAITER = '00000000-0000-4000-8000-000000000101';

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

  const waiter = await prisma.user.upsert({
    where: { id: DEMO_WAITER },
    update: {},
    create: { id: DEMO_WAITER, name: 'Demo Waiter', locale: 'nl' },
  });
  if (
    !(await prisma.roleAssignment.findFirst({
      where: { userId: waiter.id, locationId: DEMO_LOCATION, role: 'WAITER' },
    }))
  ) {
    await prisma.roleAssignment.create({
      data: {
        userId: waiter.id,
        organizationId: DEMO_ORG,
        locationId: DEMO_LOCATION,
        role: 'WAITER',
      },
    });
  }

  // Demo PINs, for development only: owner 2580, waiter 1234.
  for (const [userId, pin] of [
    [DEMO_OWNER, '2580'],
    [DEMO_WAITER, '1234'],
  ] as const) {
    const pinHash = await hashPin(pin);
    await prisma.staffPin.upsert({
      where: { userId_locationId: { userId, locationId: DEMO_LOCATION } },
      update: {},
      create: { userId, locationId: DEMO_LOCATION, pinHash },
    });
  }

  if ((await prisma.floor.count({ where: { locationId: DEMO_LOCATION } })) > 0) return;

  // Floors and tables, as in the app's demo.
  const floors = [
    {
      name: 'Inside',
      tables: [
        ['1', 2],
        ['2', 4],
        ['3', 4],
        ['4', 2],
        ['5', 4],
        ['6', 6],
        ['7', 4],
        ['8', 2],
        ['9', 4],
      ],
    },
    {
      name: 'Terrace',
      tables: [
        ['10', 4],
        ['11', 2],
        ['12', 4],
      ],
    },
  ] as const;
  const tableIds = new Map<string, string>();
  for (const [sortOrder, f] of floors.entries()) {
    const floor = await prisma.floor.create({
      data: { locationId: DEMO_LOCATION, name: f.name, sortOrder, versionStatus: 'PUBLISHED' },
    });
    for (const [i, [label, seats]] of f.tables.entries()) {
      const point = await prisma.servicePoint.create({
        data: {
          locationId: DEMO_LOCATION,
          floorId: floor.id,
          label,
          seats,
          shape: seats === 2 ? 'ROUND' : 'SQUARE',
          x: 8 + (i % 3) * 30,
          y: 8 + Math.floor(i / 3) * 30,
          w: 18,
          h: 18,
          qrToken: `demo-${label}`,
        },
      });
      tableIds.set(label, point.id);
    }
  }

  // Ingredients, with the other names waiters type.
  const org = { organizationId: DEMO_ORG };
  const verified = { verifiedAt: new Date(), verifiedSource: 'demo' };
  const ing = (
    name: string,
    contains: string[] = [],
    opts: { mayContain?: string[]; synonyms?: string[]; unverified?: boolean } = {},
  ) =>
    prisma.ingredient.create({
      data: {
        ...org,
        name,
        contains,
        mayContain: opts.mayContain ?? [],
        synonyms: opts.synonyms ?? [],
        ...(opts.unverified ? {} : verified),
      },
    });
  const beef = await ing('Beef', [], { synonyms: ['rundvlees', 'biefstuk'] });
  const flour = await ing('Wheat flour', ['GLUTEN_WHEAT'], { synonyms: ['tarwebloem', 'bloem'] });
  const stock = await ing('Veal stock', ['CELERY'], { synonyms: ['kalfsfond', 'fond'] });
  const starch = await ing('Corn starch', [], { synonyms: ['maizena', 'maiszetmeel'] });
  const potato = await ing('Potato', [], { synonyms: ['aardappel', 'patat'] });
  const rice = await ing('Rice', [], { synonyms: ['rijst'] });
  const butter = await ing('Butter', ['MILK'], { synonyms: ['boter'] });
  const tomato = await ing('Tomato', [], {
    mayContain: ['CELERY'],
    synonyms: ['tomaat', 'tomaten', 'tomatoes'],
  });
  const lettuce = await ing('Romaine', [], { synonyms: ['sla', 'lettuce'] });
  const bread = await ing('Bread', ['GLUTEN_WHEAT'], { synonyms: ['brood'] });
  const anchovy = await ing('Anchovy', ['FISH'], { synonyms: ['ansjovis'] });
  const egg = await ing('Egg yolk', ['EGGS'], { synonyms: ['eidooier', 'egg'] });
  const bass = await ing('Sea bass', ['FISH'], { synonyms: ['zeebaars'], unverified: true });
  const fryer = await prisma.equipment.create({
    data: { ...org, name: 'Fryer 1', allergens: ['FISH', 'CRUSTACEANS'] },
  });

  const component = async (
    name: string,
    nl: string,
    ingredients: { id: string }[],
    opts: { omittable?: boolean; premixed?: boolean; suitableForSevere?: boolean } = {},
  ) => {
    const c = await prisma.component.create({ data: { ...org, name, ...opts } });
    if (ingredients.length > 0) {
      await prisma.componentIngredient.createMany({
        data: ingredients.map((i) => ({ ...org, componentId: c.id, ingredientId: i.id })),
      });
    }
    await prisma.componentTranslation.createMany({
      data: [
        { ...org, componentId: c.id, locale: 'en', name },
        { ...org, componentId: c.id, locale: 'nl', name: nl },
      ],
    });
    return c;
  };
  const steakC = await component('Steak', 'Biefstuk', [beef]);
  const jus = await component('Jus', 'Jus', [flour, stock]);
  const gfJus = await component('GF jus', 'Glutenvrije jus', [starch], { suitableForSevere: true });
  const fries = await component('Fries', 'Friet', [potato], { omittable: true });
  const risotto = await component('Risotto', 'Risotto', [rice, butter], { premixed: true });
  const soup = await component('Soup', 'Soep', [tomato]);
  const lettuceC = await component('Lettuce', 'Sla', [lettuce]);
  const croutons = await component('Croutons', 'Croutons', [bread], { omittable: true });
  const dressing = await component('Dressing', 'Dressing', [anchovy, egg]);
  const bassC = await component('Sea bass', 'Zeebaars', [bass]);
  await prisma.componentEquipment.create({
    data: { ...org, componentId: fries.id, equipmentId: fryer.id },
  });
  await prisma.substitution.create({
    data: { ...org, componentId: jus.id, replacementId: gfJus.id, suitableForSevere: true },
  });

  const dishes = [
    ['Steak, jus and fries', 'Biefstuk met jus en friet', 2, 2650, [steakC, jus, fries]],
    ['Mushroom risotto', 'Paddenstoelenrisotto', 2, 2150, [risotto]],
    ['Tomato soup', 'Tomatensoep', 1, 850, [soup]],
    ['Caesar salad', 'Caesarsalade', 1, 1250, [lettuceC, croutons, dressing]],
    ['Special: sea bass', 'Special: zeebaars', 2, 2800, [bassC]],
  ] as const;
  const dishIds = new Map<string, string>();
  for (const [name, nl, course, priceCents, parts] of dishes) {
    const d = await prisma.dish.create({
      data: { locationId: DEMO_LOCATION, name, course, priceCents },
    });
    dishIds.set(name, d.id);
    await prisma.dishComponent.createMany({
      data: parts.map((c, sortOrder) => ({
        locationId: DEMO_LOCATION,
        dishId: d.id,
        componentId: c.id,
        sortOrder,
      })),
    });
    await prisma.dishTranslation.createMany({
      data: [
        { locationId: DEMO_LOCATION, dishId: d.id, locale: 'en', name },
        { locationId: DEMO_LOCATION, dishId: d.id, locale: 'nl', name: nl },
      ],
    });
  }

  // Every dish on the menu, published as version 1: service works from the published menu.
  const menu = await prisma.menu.create({ data: { locationId: DEMO_LOCATION, name: 'Menu' } });
  const onMenu = [...dishIds.values()];
  await prisma.menuItem.createMany({
    data: onMenu.map((dishId, sortOrder) => ({
      menuId: menu.id,
      dishId,
      locationId: DEMO_LOCATION,
      sortOrder,
    })),
  });
  const resolved = await loadDishes(prisma, DEMO_LOCATION, 'en', onMenu);
  const published = await prisma.menuVersion.create({
    data: {
      menuId: menu.id,
      locationId: DEMO_LOCATION,
      version: 1,
      status: 'PUBLISHED',
      snapshot: {
        dishes: { en: resolved, nl: await loadDishes(prisma, DEMO_LOCATION, 'nl', onMenu) },
      } as unknown as Prisma.InputJsonValue,
      publishedAt: new Date(),
      publishedBy: DEMO_OWNER,
    },
  });

  // Two tables in service, with what the waiter recorded and ordered. The API derives the
  // alerts from these orders: table 12 seat 3 gets "modify", table 7 seat 2 "do not serve".
  const service: [string, number, GuestAllergy[], string[]][] = [
    ['12', 1, [], ['Steak, jus and fries']],
    ['12', 2, [], ['Tomato soup']],
    [
      '12',
      3,
      [
        { allergen: 'GLUTEN', severity: 'SEVERE' },
        { allergen: 'MILK', severity: 'INTOLERANCE' },
      ],
      ['Steak, jus and fries'],
    ],
    ['12', 4, [], ['Mushroom risotto']],
    ['7', 1, [], ['Steak, jus and fries']],
    [
      '7',
      2,
      [{ ingredient: { id: tomato.id, name: 'Tomato' }, severity: 'ALLERGY' }],
      ['Tomato soup'],
    ],
    ['7', 3, [], ['Caesar salad']],
    ['7', 4, [], ['Mushroom risotto']],
  ];
  const visits = new Map<string, string>();
  for (const [label, seat, allergies, ordered] of service) {
    const servicePointId = tableIds.get(label)!;
    let visitId = visits.get(label);
    if (!visitId) {
      visitId = (
        await prisma.visit.create({
          data: { locationId: DEMO_LOCATION, servicePointId, openedById: waiter.id },
        })
      ).id;
      visits.set(label, visitId);
    }
    const guest = await prisma.guest.create({
      data: { visitId, locationId: DEMO_LOCATION, seat, noAllergy: allergies.length === 0 },
    });
    for (const a of allergies) {
      await prisma.guestAllergy.create({
        data: {
          guestId: guest.id,
          locationId: DEMO_LOCATION,
          severity: a.severity ?? 'SEVERE',
          recordedById: waiter.id,
          allergenCode: a.allergen ?? null,
          ingredientId: a.ingredient?.id ?? null,
        },
      });
    }
    for (const name of ordered) {
      const dish = resolved.find((d) => d.id === dishIds.get(name))!;
      const input = { dish, guest: allergies };
      const result = assess(input);
      const plate = await prisma.plateOrder.create({
        data: {
          locationId: DEMO_LOCATION,
          visitId,
          guestId: guest.id,
          dishId: dish.id,
          menuVersionId: published.id,
          course: dishes.find((d) => d[0] === name)![2],
          status: 'ASSESSED',
          qrToken: `demo-${label}-${seat}-${dish.id.slice(0, 8)}`,
        },
      });
      await prisma.assessment.create({
        data: {
          plateId: plate.id,
          locationId: DEMO_LOCATION,
          outcome: result.outcome,
          reasons: result.reasons as unknown as Prisma.InputJsonValue,
          input: input as unknown as Prisma.InputJsonValue,
          engineVersion: result.engineVersion,
          menuVersionId: published.id,
          inputHash: result.inputHash,
        },
      });
    }
  }
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
