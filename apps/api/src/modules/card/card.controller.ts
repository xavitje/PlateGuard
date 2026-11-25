import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import type { Locale } from '@plateguard/i18n';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe.js';
import { RequirePermission, Tenant, type TenantContext } from '../auth/permissions.js';
import { CardService } from './card.service.js';

const pdf = (bytes: Uint8Array, name: string) =>
  new StreamableFile(Buffer.from(bytes), {
    type: 'application/pdf',
    disposition: `inline; filename="${name}"`,
  });

/** The allergen card of a published menu version, for staff to print. */
@Controller('locations/:locationId/admin/menu/versions/:versionId')
export class CardController {
  constructor(private readonly card: CardService) {}

  @Get('card.pdf')
  @RequirePermission('menu.edit')
  async version(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('versionId', new ZodPipe(z.uuid())) versionId: string,
    @Query('locale', new ZodPipe(z.enum(['en', 'nl']).catch('en'))) locale: Locale,
  ) {
    return pdf(await this.card.forVersion(ctx, locationId, versionId, locale), 'allergens.pdf');
  }
}

/** Public: the allergen card of the menu that is published now, linked from the guest menu. */
@Controller('public/locations/:slug')
export class PublicCardController {
  constructor(private readonly card: CardService) {}

  @Get('allergen-card.pdf')
  async guests(
    @Param('slug') slug: string,
    @Query('locale', new ZodPipe(z.enum(['en', 'nl']).catch('en'))) locale: Locale,
  ) {
    return pdf(await this.card.forGuests(slug, locale), 'allergens.pdf');
  }
}
