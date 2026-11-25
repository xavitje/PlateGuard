import { Injectable } from '@nestjs/common';
import { loadDishes, type TenantContext } from '@plateguard/db';
import type { ResolvedDish, SearchableIngredient } from '@plateguard/domain';
import { PrismaService } from '../../common/prisma.service.js';
import type { MenuSnapshot } from '../recipes/recipes.repository.js';

export interface CurrentMenu {
  /** The published version service works from. Null until the location publishes a menu. */
  versionId: string | null;
  dishes: ResolvedDish[];
}

const snapshotDishes = (snapshot: unknown, locale: string): ResolvedDish[] => {
  const s = snapshot as MenuSnapshot | null;
  return s?.dishes[locale as 'en' | 'nl'] ?? s?.dishes.en ?? [];
};

/**
 * The menu as service sees it: the latest published version, frozen when it was published, so
 * recipe edits reach the floor only by publishing. A location that never published a menu
 * works from its live recipes.
 */
@Injectable()
export class MenuRepository {
  constructor(private readonly prisma: PrismaService) {}

  current(ctx: TenantContext, locationId: string, locale: string): Promise<CurrentMenu> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const published = await tx.menuVersion.findFirst({
        where: { locationId, status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
      });
      if (published)
        return { versionId: published.id, dishes: snapshotDishes(published.snapshot, locale) };
      return { versionId: null, dishes: await loadDishes(tx, locationId, locale) };
    });
  }

  async dishes(ctx: TenantContext, locationId: string, locale: string): Promise<ResolvedDish[]> {
    return (await this.current(ctx, locationId, locale)).dishes;
  }

  /** The dishes of earlier versions, for judging orders with the recipe they were ordered from. */
  versions(
    ctx: TenantContext,
    versionIds: string[],
    locale: string,
  ): Promise<Map<string, ResolvedDish[]>> {
    if (versionIds.length === 0) return Promise.resolve(new Map());
    return this.prisma.forTenant(ctx, async (tx) => {
      const rows = await tx.menuVersion.findMany({
        where: { id: { in: [...new Set(versionIds)] } },
        select: { id: true, snapshot: true },
      });
      return new Map(rows.map((r) => [r.id, snapshotDishes(r.snapshot, locale)]));
    });
  }

  ingredients(ctx: TenantContext): Promise<SearchableIngredient[]> {
    return this.prisma.forTenant(ctx, async (tx) =>
      (
        await tx.ingredient.findMany({
          select: { id: true, name: true, synonyms: true },
          orderBy: { name: 'asc' },
        })
      ).map((i) => ({ id: i.id, name: i.name, synonyms: i.synonyms })),
    );
  }
}
