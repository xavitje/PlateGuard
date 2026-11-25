import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { PrinterInputZ, type PrinterAddress, type PrinterInput } from '@plateguard/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe.js';
import { RequirePermission, Tenant, type TenantContext } from '../auth/permissions.js';
import { PrintService } from './print.service.js';

const IdPipe = new ZodPipe(z.uuid());

/**
 * The printer's own address: /hooks/cloudprnt/{printer}/{key}. Outside /api and without a
 * session, because the printer only knows this URL. A wrong key looks like no printer.
 */
@Controller('hooks/cloudprnt/:printerId/:key')
export class CloudPrntController {
  constructor(private readonly print: PrintService) {}

  @Post()
  @HttpCode(200)
  poll(@Param('printerId') id: string, @Param('key') key: string, @Body() body: unknown) {
    return this.print.poll(id, key, body);
  }

  @Get()
  async fetch(
    @Param('printerId') id: string,
    @Param('key') key: string,
    @Query('type') type: string | undefined,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const job = await this.print.fetch(id, key, type ?? 'text/plain', token);
    res.type(job.type).send(job.body);
  }

  @Delete()
  @HttpCode(200)
  async confirm(
    @Param('printerId') id: string,
    @Param('key') key: string,
    @Query('code') code: string | undefined,
    @Query('token') token: string | undefined,
  ) {
    await this.print.confirm(id, key, code ?? '200 OK', token);
    return {};
  }
}

/** Kitchen printers in admin, and printing a ticket again from the kitchen. */
@Controller('locations/:locationId')
export class PrintController {
  constructor(private readonly print: PrintService) {}

  @Get('admin/printers')
  @RequirePermission('integrations.manage')
  printers(@Tenant() ctx: TenantContext, @Param('locationId') locationId: string) {
    return this.print.printers(ctx, locationId);
  }

  @Post('admin/printers')
  @RequirePermission('integrations.manage')
  add(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Body(new ZodPipe(PrinterInputZ)) body: PrinterInput,
  ): Promise<PrinterAddress> {
    return this.print.add(ctx, locationId, body.name);
  }

  @Post('admin/printers/:printerId/key')
  @RequirePermission('integrations.manage')
  newKey(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('printerId', IdPipe) printerId: string,
  ): Promise<PrinterAddress> {
    return this.print.newKey(ctx, locationId, printerId);
  }

  @Post('admin/printers/:printerId/test')
  @HttpCode(204)
  @RequirePermission('integrations.manage')
  async test(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('printerId', IdPipe) printerId: string,
  ) {
    await this.print.test(ctx, locationId, printerId);
  }

  @Delete('admin/printers/:printerId')
  @RequirePermission('integrations.manage')
  remove(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('printerId', IdPipe) printerId: string,
  ) {
    return this.print.remove(ctx, locationId, printerId);
  }

  @Post('plates/:plateId/print')
  @HttpCode(204)
  @RequirePermission('kitchen.view')
  async reprint(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('plateId', IdPipe) plateId: string,
  ) {
    await this.print.reprint(ctx, locationId, plateId);
  }
}
