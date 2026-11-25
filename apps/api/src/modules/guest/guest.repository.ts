import { Injectable } from '@nestjs/common';
import type { ResolvedDish } from '@plateguard/domain';
import { PrismaService } from '../../common/prisma.service.js';
import type { MenuSnapshot } from '../recipes/recipes.repository.js';

export interface PublishedMenu {
  location: { name: string };
  /** Null until the location publishes a menu. */
  dishes: (ResolvedDish & { course: number })[] | null;
}

/**
 * The public menu has no signed-in user: the location is found by its slug, then the latest
 * published version is read inside that location's tenant, like any other read.
 */
@Injectable()
export class GuestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async published(slug: string, locale: string): Promise<PublishedMenu | null> {
    const location = await this.prisma.system().location.findUnique({
      where: { slug },
      select: { id: true, organizationId: true, name: true },
    });
    if (!location) return null;
    const ctx = { organizationId: location.organizationId, locationIds: [location.id] };
    return this.prisma.forTenant(ctx, async (tx) => {
      const version = await tx.menuVersion.findFirst({
        where: { locationId: location.id, status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        select: { snapshot: true },
      });
      if (!version) return { location: { name: location.name }, dishes: null };
      const snapshot = version.snapshot as unknown as MenuSnapshot;
      const dishes = snapshot.dishes[locale as 'en' | 'nl'] ?? snapshot.dishes.en;
      const courses = new Map(
        (
          await tx.dish.findMany({
            where: { id: { in: dishes.map((d) => d.id) } },
            select: { id: true, course: true },
          })
        ).map((d) => [d.id, d.course]),
      );
      return {
        location: { name: location.name },
        dishes: dishes.map((d) => ({ ...d, course: courses.get(d.id) ?? 1 })),
      };
    });
  }
}
