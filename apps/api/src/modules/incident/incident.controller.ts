import { Body, Controller, Get, Param, Post, Put, Query, StreamableFile } from '@nestjs/common';
import {
  IncidentFollowUpZ,
  IncidentReportZ,
  type IncidentFollowUp,
  type IncidentReport,
} from '@plateguard/contracts';
import type { Principal } from '@plateguard/domain';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe.js';
import {
  CurrentPrincipal,
  RequirePermission,
  Tenant,
  type TenantContext,
} from '../auth/permissions.js';
import { IncidentService } from './incident.service.js';

const IdPipe = new ZodPipe(z.uuid());

/** Reporting an incident from a table, and the manager's follow-up and PDF. */
@Controller('locations/:locationId')
export class IncidentController {
  constructor(private readonly incidents: IncidentService) {}

  @Post('tables/:label/incidents')
  @RequirePermission('incident.report')
  report(
    @Tenant() ctx: TenantContext,
    @CurrentPrincipal() user: Principal,
    @Param('locationId') locationId: string,
    @Param('label') label: string,
    @Body(new ZodPipe(IncidentReportZ)) body: IncidentReport,
  ) {
    return this.incidents.report(ctx, locationId, label, body, user.userId);
  }

  @Get('incidents')
  @RequirePermission('incident.manage')
  list(@Tenant() ctx: TenantContext, @Param('locationId') locationId: string) {
    return this.incidents.list(ctx, locationId);
  }

  @Get('incidents/:id')
  @RequirePermission('incident.manage')
  get(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('id', IdPipe) id: string,
  ) {
    return this.incidents.get(ctx, locationId, id);
  }

  @Put('incidents/:id')
  @RequirePermission('incident.manage')
  followUp(
    @Tenant() ctx: TenantContext,
    @CurrentPrincipal() user: Principal,
    @Param('locationId') locationId: string,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(IncidentFollowUpZ)) body: IncidentFollowUp,
  ) {
    return this.incidents.followUp(ctx, locationId, id, body, user.userId);
  }

  @Get('incidents/:id/report.pdf')
  @RequirePermission('incident.manage')
  async pdf(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('id', IdPipe) id: string,
    @Query('locale', new ZodPipe(z.enum(['en', 'nl']).catch('en'))) locale: 'en' | 'nl',
  ) {
    const bytes = await this.incidents.pdf(ctx, locationId, id, locale);
    return new StreamableFile(Buffer.from(bytes), {
      type: 'application/pdf',
      disposition: `inline; filename="incident-${id.slice(0, 8)}.pdf"`,
    });
  }
}
