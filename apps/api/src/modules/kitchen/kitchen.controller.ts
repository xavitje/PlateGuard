import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  LocationSettingsZ,
  PlateCheckZ,
  PlateOverrideZ,
  PlateRejectZ,
  type LocationSettings,
  type PlateCheck,
  type PlateOverride,
  type PlateReject,
} from '@plateguard/contracts';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe.js';
import { RequirePermission, Tenant, type TenantContext } from '../auth/permissions.js';
import { KitchenService } from './kitchen.service.js';

const LocaleZ = z.enum(['en', 'nl']).catch('en');
const PlateIdPipe = new ZodPipe(z.uuid());

/** The kitchen display and the pass: allergy tickets, confirming, rejecting and serving. */
@Controller('locations/:locationId')
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get('kitchen')
  @RequirePermission('kitchen.view')
  tickets(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Query('locale', new ZodPipe(LocaleZ)) locale: string,
  ) {
    return this.kitchen.tickets(ctx, locationId, locale);
  }

  @Post('plates/:plateId/check')
  @HttpCode(204)
  @RequirePermission('plate.check')
  check(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('plateId', PlateIdPipe) plateId: string,
    @Query('locale', new ZodPipe(LocaleZ)) locale: string,
    @Body(new ZodPipe(PlateCheckZ)) body: PlateCheck,
  ) {
    return this.kitchen.check(ctx, locationId, plateId, body.checked, locale);
  }

  @Post('plates/:plateId/reject')
  @HttpCode(204)
  @RequirePermission('plate.reject')
  reject(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('plateId', PlateIdPipe) plateId: string,
    @Body(new ZodPipe(PlateRejectZ)) body: PlateReject,
  ) {
    return this.kitchen.reject(ctx, locationId, plateId, body.reason);
  }

  @Post('plates/:plateId/override')
  @HttpCode(204)
  @RequirePermission('plate.override')
  override(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('plateId', PlateIdPipe) plateId: string,
    @Query('locale', new ZodPipe(LocaleZ)) locale: string,
    @Body(new ZodPipe(PlateOverrideZ)) body: PlateOverride,
  ) {
    return this.kitchen.override(ctx, locationId, plateId, body, locale);
  }

  @Post('plates/:plateId/pass-check')
  @HttpCode(204)
  @RequirePermission('plate.pass_check')
  passCheck(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('plateId', PlateIdPipe) plateId: string,
  ) {
    return this.kitchen.passChecked(ctx, locationId, plateId);
  }

  @Post('plates/:plateId/serve')
  @HttpCode(204)
  @RequirePermission('plate.serve')
  serve(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('plateId', PlateIdPipe) plateId: string,
  ) {
    return this.kitchen.serve(ctx, locationId, plateId);
  }

  @Get('admin/settings')
  @RequirePermission('floorplan.edit')
  async getSettings(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
  ): Promise<LocationSettings> {
    return { passCheck: await this.kitchen.passCheck(ctx, locationId) };
  }

  @Put('admin/settings')
  @HttpCode(204)
  @RequirePermission('floorplan.edit')
  settings(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Body(new ZodPipe(LocationSettingsZ)) body: LocationSettings,
  ) {
    return this.kitchen.setPassCheck(ctx, locationId, body.passCheck);
  }
}
