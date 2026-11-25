import { Injectable } from '@nestjs/common';
import { EU14, type ResolvedDish } from '@plateguard/domain';
import { PrismaService } from '../../common/prisma.service.js';
import type { TenantContext } from '../auth/permissions.js';
import type { MenuSnapshot } from '../recipes/recipes.repository.js';

export interface CardSource {
  locationName: string;
  version: number;
  publishedAt: Date;
  dishes: ResolvedDish[];
  allergens: { code: string; name: string }[];
}

/** The frozen menu version a card is drawn from, and the allergen names in the card's language. */
@Injectable()
export class CardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** A version of this location, published now or before. Drafts have no card. */
  version(ctx: TenantContext, locationId: string, versionId: string, locale: string) {
    return this.load(
      ctx,
      locationId,
      { id: versionId, status: { in: ['PUBLISHED', 'ARCHIVED'] } },
      locale,
    );
  }

  /** The latest published version, for the public link. Null for an unknown slug or no menu. */
  async publishedBySlug(slug: string, locale: string): Promise<CardSource | null> {
    const location = await this.prisma.system().location.findUnique({
      where: { slug },
      select: { id: true, organizationId: true },
    });
    if (!location) return null;
    const ctx = { organizationId: location.organizationId, locationIds: [location.id] };
    return this.load(ctx, location.id, { status: 'PUBLISHED' }, locale);
  }

  private load(
    ctx: TenantContext,
    locationId: string,
    where: { id?: string; status: 'PUBLISHED' | { in: ('PUBLISHED' | 'ARCHIVED')[] } },
    locale: string,
  ): Promise<CardSource | null> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const [v, location, allergens] = await Promise.all([
        tx.menuVersion.findFirst({
          where: { locationId, ...where },
          orderBy: { publishedAt: 'desc' },
        }),
        tx.location.findUnique({ where: { id: locationId }, select: { name: true } }),
        tx.allergen.findMany({
          where: { code: { in: [...EU14] } },
          include: { translations: { where: { locale: { in: [locale, 'en'] } } } },
        }),
      ]);
      if (!v?.snapshot || !location) return null;
      const snapshot = v.snapshot as unknown as MenuSnapshot;
      const names = new Map(
        allergens.map((a) => [
          a.code,
          a.translations.find((t) => t.locale === locale)?.name ??
            a.translations.find((t) => t.locale === 'en')?.name ??
            a.code,
        ]),
      );
      return {
        locationName: location.name,
        version: v.version,
        publishedAt: v.publishedAt ?? new Date(0),
        dishes: snapshot.dishes[locale as 'en' | 'nl'] ?? snapshot.dishes.en,
        allergens: EU14.map((code) => ({ code, name: names.get(code) ?? code })),
      };
    });
  }
}
