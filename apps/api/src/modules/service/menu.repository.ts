import { Injectable } from '@nestjs/common';
import { loadDishes, type TenantContext } from '@plateguard/db';
import type { ResolvedDish, SearchableIngredient } from '@plateguard/domain';
import { PrismaService } from '../../common/prisma.service.js';

/**
 * Reads the recipe tree of a location's dishes as the engine needs it. Components are loaded
 * once per call and resolved in memory: nesting, substitutes and equipment included.
 */
@Injectable()
export class MenuRepository {
  constructor(private readonly prisma: PrismaService) {}

  dishes(ctx: TenantContext, locationId: string, locale: string): Promise<ResolvedDish[]> {
    return this.prisma.forTenant(ctx, (tx) => loadDishes(tx, locationId, locale));
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
