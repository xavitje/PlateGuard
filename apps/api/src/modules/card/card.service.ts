import { Injectable, NotFoundException } from '@nestjs/common';
import { allergenCard } from '@plateguard/domain';
import { createI18n, type Locale } from '@plateguard/i18n';
import type { TenantContext } from '../auth/permissions.js';
import { renderAllergenCard } from './allergen-card.pdf.js';
import { CardRepository, type CardSource } from './card.repository.js';

/**
 * The allergen card of a published menu, as PDF. It is drawn from the frozen version, so the
 * card of a version never changes: it exists from the moment the menu is published.
 */
@Injectable()
export class CardService {
  private readonly translators = new Map<string, ReturnType<typeof createI18n>>();

  constructor(private readonly repo: CardRepository) {}

  async forVersion(ctx: TenantContext, locationId: string, versionId: string, locale: Locale) {
    const source = await this.repo.version(ctx, locationId, versionId, locale);
    if (!source) throw new NotFoundException({ code: 'MENU_VERSION_NOT_FOUND' });
    return this.render(source, locale);
  }

  async forGuests(slug: string, locale: Locale) {
    const source = await this.repo.publishedBySlug(slug, locale);
    if (!source) throw new NotFoundException({ code: 'MENU_NOT_PUBLISHED' });
    return this.render(source, locale);
  }

  private async render(source: CardSource, locale: Locale) {
    let tr = this.translators.get(locale);
    if (!tr) this.translators.set(locale, (tr = createI18n(locale)));
    const { t } = await tr;
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(source.publishedAt);
    return renderAllergenCard({
      title: t('card:title'),
      subtitle: t('card:subtitle', {
        location: source.locationName,
        version: source.version,
        date,
      }),
      allergens: source.allergens,
      rows: allergenCard(
        source.dishes,
        source.allergens.map((a) => a.code),
      ),
      legend: {
        CONTAINS: t('card:legend.CONTAINS'),
        ON_REQUEST: t('card:legend.ON_REQUEST'),
        TRACES: t('card:legend.TRACES'),
        UNKNOWN: t('card:legend.UNKNOWN'),
      },
      footer: t('card:footer'),
      page: (n, of) => t('card:page', { n, of }),
    });
  }
}
