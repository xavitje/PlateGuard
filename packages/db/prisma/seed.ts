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
import { COMPONENTS, DISHES, FRYER, INGREDIENTS } from './seed-data/menu.js';

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

  // Floors, tables and the open tables in service only go into a new demo location; the menu
  // below also tops up an existing one.
  const fresh = (await prisma.floor.count({ where: { locationId: DEMO_LOCATION } })) === 0;
  const tableIds = new Map<string, string>();
  if (fresh) await seedFloors(tableIds);

  const { published, dishIds, ingredientIds, resolved } = await seedMenu();
  if (!fresh) return;

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
      [{ ingredient: { id: ingredientIds.get('tomato')!, name: 'Tomato' }, severity: 'ALLERGY' }],
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
          course: DISHES.find((d) => d.name === name)!.course,
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

/**
 * Adds whatever of the demo menu (seed-data/menu.ts) the demo location lacks: ingredients,
 * components and their recipes, dishes, and their place on the menu. When anything changed,
 * the menu is published as a new version, so service sees it straight away. Matches by name,
 * so it can run again on a location that already has the menu.
 */
async function seedMenu() {
  const org = { organizationId: DEMO_ORG };
  const loc = { locationId: DEMO_LOCATION };
  let changed = false;

  const ingredientIds = new Map<string, string>();
  for (const [key, i] of Object.entries(INGREDIENTS)) {
    let row = await prisma.ingredient.findFirst({ where: { ...org, name: i.name } });
    if (!row) {
      row = await prisma.ingredient.create({
        data: {
          ...org,
          name: i.name,
          contains: i.contains ?? [],
          mayContain: i.mayContain ?? [],
          synonyms: i.synonyms ?? [],
          ...(i.unverified ? {} : { verifiedAt: new Date(), verifiedSource: 'demo' }),
        },
      });
      changed = true;
    }
    ingredientIds.set(key, row.id);
  }

  const fryer =
    (await prisma.equipment.findFirst({ where: { ...org, name: FRYER.name } })) ??
    (await prisma.equipment.create({ data: { ...org, ...FRYER } }));

  const componentIds = new Map<string, string>();
  for (const [key, c] of Object.entries(COMPONENTS)) {
    let row = await prisma.component.findFirst({ where: { ...org, name: c.name } });
    if (!row) {
      row = await prisma.component.create({
        data: {
          ...org,
          name: c.name,
          omittable: c.omittable ?? false,
          premixed: c.premixed ?? false,
          suitableForSevere: c.suitableForSevere ?? false,
        },
      });
      await prisma.componentTranslation.createMany({
        data: [
          { ...org, componentId: row.id, locale: 'en', name: c.name },
          { ...org, componentId: row.id, locale: 'nl', name: c.nl },
        ],
      });
      changed = true;
    }
    componentIds.set(key, row.id);
    // The full recipe: adds the ingredients an older seed left out, keeps any added since.
    const added = await prisma.componentIngredient.createMany({
      data: c.ingredients.map((k) => ({
        ...org,
        componentId: row.id,
        ingredientId: ingredientIds.get(k)!,
      })),
      skipDuplicates: true,
    });
    if (c.fryer) {
      const fried = await prisma.componentEquipment.createMany({
        data: [{ ...org, componentId: row.id, equipmentId: fryer.id }],
        skipDuplicates: true,
      });
      changed ||= fried.count > 0;
    }
    changed ||= added.count > 0;
  }
  for (const [key, c] of Object.entries(COMPONENTS)) {
    for (const r of c.substitutions ?? []) {
      const swap = await prisma.substitution.createMany({
        data: [
          {
            ...org,
            componentId: componentIds.get(key)!,
            replacementId: componentIds.get(r)!,
            suitableForSevere: COMPONENTS[r]!.suitableForSevere ?? false,
          },
        ],
        skipDuplicates: true,
      });
      changed ||= swap.count > 0;
    }
  }

  const dishIds = new Map<string, string>();
  for (const d of DISHES) {
    const row = await prisma.dish.findFirst({ where: { ...loc, name: d.name } });
    if (row) {
      dishIds.set(d.name, row.id);
      // Places an older dish in the grid, unless someone already placed it differently.
      if (!row.subcategory && (!row.category || row.category === d.category)) {
        await prisma.dish.update({
          where: { id: row.id },
          data: { category: d.category, subcategory: d.subcategory },
        });
      }
      continue;
    }
    const dish = await prisma.dish.create({
      data: {
        ...loc,
        name: d.name,
        course: d.course,
        priceCents: d.priceCents,
        category: d.category,
        subcategory: d.subcategory,
      },
    });
    await prisma.dishComponent.createMany({
      data: d.components.map((k, sortOrder) => ({
        ...loc,
        dishId: dish.id,
        componentId: componentIds.get(k)!,
        sortOrder,
      })),
    });
    await prisma.dishTranslation.createMany({
      data: [
        { ...loc, dishId: dish.id, locale: 'en', name: d.name },
        { ...loc, dishId: dish.id, locale: 'nl', name: d.nl },
      ],
    });
    dishIds.set(d.name, dish.id);
    changed = true;
  }

  // Every demo dish on the menu, after what is on it already.
  const menu =
    (await prisma.menu.findFirst({ where: loc, orderBy: { name: 'asc' } })) ??
    (await prisma.menu.create({ data: { ...loc, name: 'Menu' } }));
  const items = await prisma.menuItem.findMany({
    where: { menuId: menu.id },
    orderBy: { sortOrder: 'asc' },
  });
  const onMenu = items.map((i) => i.dishId);
  const missing = DISHES.map((d) => dishIds.get(d.name)!).filter((id) => !onMenu.includes(id));
  if (missing.length > 0) {
    const from = items.reduce((max, i) => Math.max(max, i.sortOrder + 1), 0);
    await prisma.menuItem.createMany({
      data: missing.map((dishId, i) => ({ ...loc, menuId: menu.id, dishId, sortOrder: from + i })),
    });
    onMenu.push(...missing);
    changed = true;
  }

  let published = await prisma.menuVersion.findFirst({
    where: { menuId: menu.id, status: 'PUBLISHED' },
    orderBy: { version: 'desc' },
  });
  const resolved = await loadDishes(prisma, DEMO_LOCATION, 'en', onMenu);
  if (changed || !published) {
    const last = await prisma.menuVersion.findFirst({
      where: { menuId: menu.id },
      orderBy: { version: 'desc' },
    });
    await prisma.menuVersion.updateMany({
      where: { menuId: menu.id, status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });
    published = await prisma.menuVersion.create({
      data: {
        ...loc,
        menuId: menu.id,
        version: (last?.version ?? 0) + 1,
        status: 'PUBLISHED',
        snapshot: {
          dishes: { en: resolved, nl: await loadDishes(prisma, DEMO_LOCATION, 'nl', onMenu) },
        } as unknown as Prisma.InputJsonValue,
        publishedAt: new Date(),
        publishedBy: DEMO_OWNER,
      },
    });
  }
  return { published, dishIds, ingredientIds, resolved };
}

async function seedFloors(tableIds: Map<string, string>) {
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
