import { Injectable } from '@nestjs/common';
import type {
  ComponentInput,
  ComponentResponse,
  DishInput,
  DishResponse,
  EquipmentInput,
  EquipmentResponse,
  IngredientInput,
  IngredientResponse,
} from '@plateguard/contracts';
import { loadDishes, type Prisma, type TenantContext, type TenantTx } from '@plateguard/db';
import type { ResolvedDish } from '@plateguard/domain';
import { PrismaService } from '../../common/prisma.service.js';

/** What a published menu freezes: every dish on it, resolved, in each language. */
export interface MenuSnapshot {
  dishes: Record<'en' | 'nl', ResolvedDish[]>;
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** Ingredients, equipment, components and dishes of one organization and location. */
@Injectable()
export class RecipesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private tx<T>(ctx: TenantContext, fn: (tx: TenantTx) => Promise<T>) {
    return this.prisma.forTenant(ctx, fn);
  }

  // ── Allergens ──

  allergens(ctx: TenantContext, locale: string) {
    return this.tx(ctx, async (tx) => {
      const rows = await tx.allergen.findMany({
        include: { translations: { where: { locale: { in: [locale, 'en'] } } } },
        orderBy: { code: 'asc' },
      });
      return rows.map((a) => ({
        code: a.code,
        parent: a.parentCode,
        name:
          a.translations.find((t) => t.locale === locale)?.name ??
          a.translations.find((t) => t.locale === 'en')?.name ??
          a.code,
      }));
    });
  }

  // ── Ingredients ──

  ingredients(ctx: TenantContext): Promise<IngredientResponse[]> {
    return this.tx(ctx, async (tx) =>
      (
        await tx.ingredient.findMany({
          include: { _count: { select: { components: true } } },
          orderBy: { name: 'asc' },
        })
      ).map(toIngredient),
    );
  }

  saveIngredient(
    ctx: TenantContext,
    id: string | null,
    input: IngredientInput,
    userId: string,
  ): Promise<IngredientResponse | null> {
    return this.tx(ctx, async (tx) => {
      const before = id ? await tx.ingredient.findUnique({ where: { id } }) : null;
      if (id && !before) return null;
      // Verification belongs to these exact allergens: a change without a new check drops it.
      const unchanged =
        before &&
        sameSet(before.contains, input.contains) &&
        sameSet(before.mayContain, input.mayContain);
      const verification = input.verified
        ? unchanged && before.verifiedAt
          ? {}
          : { verifiedAt: new Date(), verifiedById: userId, verifiedSource: 'manual' }
        : { verifiedAt: null, verifiedById: null, verifiedSource: null };
      const data = {
        name: input.name,
        synonyms: input.synonyms,
        contains: input.contains,
        mayContain: input.mayContain,
        supplier: input.supplier ?? null,
        brand: input.brand ?? null,
        articleNumber: input.articleNumber ?? null,
        ...verification,
      };
      const include = { _count: { select: { components: true } } } as const;
      const row = id
        ? await tx.ingredient.update({ where: { id }, data, include })
        : await tx.ingredient.create({
            data: { ...data, organizationId: ctx.organizationId },
            include,
          });
      return toIngredient(row);
    });
  }

  // ── Equipment ──

  equipment(ctx: TenantContext): Promise<EquipmentResponse[]> {
    return this.tx(ctx, (tx) =>
      tx.equipment.findMany({
        select: { id: true, name: true, allergens: true },
        orderBy: { name: 'asc' },
      }),
    );
  }

  saveEquipment(
    ctx: TenantContext,
    id: string | null,
    input: EquipmentInput,
  ): Promise<EquipmentResponse | null> {
    return this.tx(ctx, async (tx) => {
      const select = { id: true, name: true, allergens: true } as const;
      if (id) {
        if (!(await tx.equipment.findUnique({ where: { id } }))) return null;
        return tx.equipment.update({ where: { id }, data: input, select });
      }
      return tx.equipment.create({
        data: { ...input, organizationId: ctx.organizationId },
        select,
      });
    });
  }

  // ── Components ──

  components(ctx: TenantContext): Promise<ComponentResponse[]> {
    return this.tx(ctx, async (tx) =>
      (
        await tx.component.findMany({
          include: componentInclude,
          orderBy: { name: 'asc' },
        })
      ).map(toComponent),
    );
  }

  /** Parent → children, for the cycle check before saving. */
  componentGraph(ctx: TenantContext): Promise<Map<string, string[]>> {
    return this.tx(ctx, async (tx) => {
      const edges = await tx.componentChild.findMany({ select: { parentId: true, childId: true } });
      const graph = new Map<string, string[]>();
      for (const e of edges) graph.set(e.parentId, [...(graph.get(e.parentId) ?? []), e.childId]);
      return graph;
    });
  }

  /** Ids among these that belong to this organization (RLS hides the rest). */
  existing(
    ctx: TenantContext,
    kind: 'ingredient' | 'equipment' | 'component',
    ids: string[],
  ): Promise<Set<string>> {
    if (ids.length === 0) return Promise.resolve(new Set());
    return this.tx(ctx, async (tx) => {
      const where = { id: { in: ids } };
      const select = { id: true } as const;
      const rows =
        kind === 'ingredient'
          ? await tx.ingredient.findMany({ where, select })
          : kind === 'equipment'
            ? await tx.equipment.findMany({ where, select })
            : await tx.component.findMany({ where, select });
      return new Set(rows.map((r) => r.id));
    });
  }

  saveComponent(
    ctx: TenantContext,
    id: string | null,
    input: ComponentInput,
  ): Promise<ComponentResponse | null> {
    return this.tx(ctx, async (tx) => {
      const org = { organizationId: ctx.organizationId };
      const flags = {
        name: input.name,
        omittable: input.omittable,
        premixed: input.premixed,
        suitableForSevere: input.suitableForSevere,
      };
      let componentId: string;
      if (id) {
        if (!(await tx.component.findUnique({ where: { id } }))) return null;
        await tx.component.update({ where: { id }, data: flags });
        await Promise.all([
          tx.componentIngredient.deleteMany({ where: { componentId: id } }),
          tx.componentEquipment.deleteMany({ where: { componentId: id } }),
          tx.componentChild.deleteMany({ where: { parentId: id } }),
          tx.substitution.deleteMany({ where: { componentId: id } }),
          tx.componentTranslation.deleteMany({ where: { componentId: id } }),
        ]);
        componentId = id;
      } else {
        componentId = (await tx.component.create({ data: { ...flags, ...org } })).id;
      }
      await tx.componentIngredient.createMany({
        data: input.ingredientIds.map((ingredientId) => ({ ...org, componentId, ingredientId })),
      });
      await tx.componentEquipment.createMany({
        data: input.equipmentIds.map((equipmentId) => ({ ...org, componentId, equipmentId })),
      });
      await tx.componentChild.createMany({
        data: input.childIds.map((childId) => ({ ...org, parentId: componentId, childId })),
      });
      await tx.substitution.createMany({
        data: input.substitutions.map((s) => ({ ...org, componentId, ...s })),
      });
      await tx.componentTranslation.createMany({
        data: [
          { ...org, componentId, locale: 'en', name: input.name },
          ...(input.nameNl ? [{ ...org, componentId, locale: 'nl', name: input.nameNl }] : []),
        ],
      });
      return toComponent(
        await tx.component.findUniqueOrThrow({
          where: { id: componentId },
          include: componentInclude,
        }),
      );
    });
  }

  // ── Dishes ──

  dishes(ctx: TenantContext, locationId: string): Promise<DishResponse[]> {
    return this.tx(ctx, async (tx) =>
      (
        await tx.dish.findMany({
          where: { locationId },
          include: dishInclude,
          orderBy: [{ course: 'asc' }, { name: 'asc' }],
        })
      ).map(toDish),
    );
  }

  saveDish(
    ctx: TenantContext,
    locationId: string,
    id: string | null,
    input: DishInput,
  ): Promise<DishResponse | null> {
    return this.tx(ctx, async (tx) => {
      const data = {
        name: input.name,
        course: input.course,
        category: input.category?.trim() || null,
        subcategory: (input.category?.trim() && input.subcategory?.trim()) || null,
        priceCents: input.priceCents,
      };
      let dishId: string;
      if (id) {
        if (!(await tx.dish.findFirst({ where: { id, locationId } }))) return null;
        await tx.dish.update({ where: { id }, data });
        await tx.dishComponent.deleteMany({ where: { dishId: id } });
        await tx.dishTranslation.deleteMany({ where: { dishId: id } });
        dishId = id;
      } else {
        dishId = (await tx.dish.create({ data: { ...data, locationId } })).id;
      }
      await tx.dishComponent.createMany({
        data: input.componentIds.map((componentId, sortOrder) => ({
          dishId,
          componentId,
          locationId,
          sortOrder,
        })),
      });
      await tx.dishTranslation.createMany({
        data: [
          { dishId, locationId, locale: 'en', name: input.name },
          ...(input.nameNl ? [{ dishId, locationId, locale: 'nl', name: input.nameNl }] : []),
        ],
      });
      return toDish(
        await tx.dish.findUniqueOrThrow({ where: { id: dishId }, include: dishInclude }),
      );
    });
  }

  // ── Menu ──

  /** The location's menu, created on first use. One menu per location for now. */
  menu(ctx: TenantContext, locationId: string) {
    return this.tx(ctx, async (tx) => {
      const menu =
        (await tx.menu.findFirst({ where: { locationId }, orderBy: { name: 'asc' } })) ??
        (await tx.menu.create({ data: { locationId, name: 'Menu' } }));
      const [items, versions] = await Promise.all([
        tx.menuItem.findMany({ where: { menuId: menu.id }, orderBy: { sortOrder: 'asc' } }),
        tx.menuVersion.findMany({
          where: { menuId: menu.id, status: { in: ['PUBLISHED', 'ARCHIVED'] } },
          orderBy: { version: 'desc' },
        }),
      ]);
      return { menu, dishIds: items.map((i) => i.dishId), versions };
    });
  }

  setMenuItems(ctx: TenantContext, locationId: string, menuId: string, dishIds: string[]) {
    return this.tx(ctx, async (tx) => {
      await tx.menuItem.deleteMany({ where: { menuId } });
      await tx.menuItem.createMany({
        data: dishIds.map((dishId, sortOrder) => ({ menuId, dishId, locationId, sortOrder })),
      });
    });
  }

  /** The draft as it would be published: resolved now, in both languages. */
  draftSnapshot(ctx: TenantContext, locationId: string, dishIds: string[]): Promise<MenuSnapshot> {
    return this.tx(ctx, async (tx) => ({
      dishes: {
        en: await loadDishes(tx, locationId, 'en', dishIds),
        nl: await loadDishes(tx, locationId, 'nl', dishIds),
      },
    }));
  }

  /** Freezes the snapshot as the next version; the previous published version is archived. */
  publish(
    ctx: TenantContext,
    locationId: string,
    menuId: string,
    snapshot: MenuSnapshot,
    userId: string,
  ) {
    return this.tx(ctx, async (tx) => {
      const last = await tx.menuVersion.findFirst({
        where: { menuId },
        orderBy: { version: 'desc' },
      });
      await tx.menuVersion.updateMany({
        where: { menuId, status: 'PUBLISHED' },
        data: { status: 'ARCHIVED' },
      });
      return tx.menuVersion.create({
        data: {
          menuId,
          locationId,
          version: (last?.version ?? 0) + 1,
          status: 'PUBLISHED',
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          publishedAt: new Date(),
          publishedBy: userId,
        },
      });
    });
  }
}

const componentInclude = {
  ingredients: true,
  equipment: true,
  children: true,
  substitutions: true,
  translations: { where: { locale: 'nl' } },
} satisfies Prisma.ComponentInclude;

const dishInclude = {
  components: { orderBy: { sortOrder: 'asc' } },
  translations: { where: { locale: 'nl' } },
} satisfies Prisma.DishInclude;

function toIngredient(
  i: Prisma.IngredientGetPayload<{ include: { _count: { select: { components: true } } } }>,
): IngredientResponse {
  return {
    id: i.id,
    name: i.name,
    synonyms: i.synonyms,
    contains: i.contains,
    mayContain: i.mayContain,
    supplier: i.supplier,
    brand: i.brand,
    articleNumber: i.articleNumber,
    verifiedAt: i.verifiedAt?.toISOString() ?? null,
    verifiedSource: i.verifiedSource,
    usedIn: i._count.components,
  };
}

function toComponent(
  c: Prisma.ComponentGetPayload<{ include: typeof componentInclude }>,
): ComponentResponse {
  return {
    id: c.id,
    name: c.name,
    nameNl: c.translations[0]?.name ?? null,
    omittable: c.omittable,
    premixed: c.premixed,
    suitableForSevere: c.suitableForSevere,
    ingredientIds: c.ingredients.map((i) => i.ingredientId),
    equipmentIds: c.equipment.map((e) => e.equipmentId),
    childIds: c.children.map((ch) => ch.childId),
    substitutions: c.substitutions.map((s) => ({
      replacementId: s.replacementId,
      suitableForSevere: s.suitableForSevere,
    })),
  };
}

function toDish(d: Prisma.DishGetPayload<{ include: typeof dishInclude }>): DishResponse {
  return {
    id: d.id,
    name: d.name,
    nameNl: d.translations[0]?.name ?? null,
    course: d.course,
    category: d.category,
    subcategory: d.subcategory,
    priceCents: d.priceCents,
    componentIds: d.components.map((c) => c.componentId),
  };
}
