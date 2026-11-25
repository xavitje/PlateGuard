import { Controller, Get, Query } from '@nestjs/common';
import type { Principal } from '@plateguard/domain';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe.js';
import {
  CurrentPrincipal,
  RequirePermission,
  Tenant,
  type TenantContext,
} from '../auth/permissions.js';
import { DashboardService } from './dashboard.service.js';

/** Figures over the last days for every location of the group this user may see. */
@Controller('locations/:locationId')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard')
  @RequirePermission('dashboard.view')
  get(
    @Tenant() ctx: TenantContext,
    @CurrentPrincipal() user: Principal,
    @Query('days', new ZodPipe(z.coerce.number().int().min(1).max(365).catch(30))) days: number,
  ) {
    return this.dashboard.get(user, ctx.organizationId, days);
  }
}
