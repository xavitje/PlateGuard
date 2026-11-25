import { Controller, Get, Param, Query } from '@nestjs/common';
import { GuestAvoidZ } from '@plateguard/contracts';
import type { AllergenCode } from '@plateguard/domain';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe.js';
import { GuestService } from './guest.service.js';

/** Public: the allergen menu a guest opens from the QR code on the table. No sign-in. */
@Controller('public/locations/:slug')
export class GuestController {
  constructor(private readonly guest: GuestService) {}

  @Get('menu')
  menu(
    @Param('slug') slug: string,
    @Query('locale', new ZodPipe(z.enum(['en', 'nl']).catch('en'))) locale: string,
    @Query('avoid', new ZodPipe(GuestAvoidZ)) avoid: AllergenCode[],
  ) {
    return this.guest.menu(slug, locale, avoid);
  }
}
