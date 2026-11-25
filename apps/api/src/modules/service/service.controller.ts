import { Body, Controller, Delete, Get, Param, Put, Post, Query } from '@nestjs/common';
import {
  AlertsReadZ,
  OrderCreateZ,
  SeatParamZ,
  SeatUpdateZ,
  type AlertsRead,
  type OrderCreate,
  type SeatUpdate,
} from '@plateguard/contracts';
import { z } from 'zod';
import type { Principal } from '@plateguard/domain';
import { ZodPipe } from '../../common/zod.pipe.js';
import {
  CurrentPrincipal,
  RequirePermission,
  Tenant,
  type TenantContext,
} from '../auth/permissions.js';
import { ServiceService } from './service.service.js';

const LocaleZ = z.enum(['en', 'nl']).catch('en');

/** The waiter's view of a location: floors and tables, the menu, seats, orders and alerts. */
@Controller('locations/:locationId')
export class ServiceController {
  constructor(private readonly service: ServiceService) {}

  @Get('floors')
  @RequirePermission('table.view')
  floors(@Tenant() ctx: TenantContext, @Param('locationId') locationId: string) {
    return this.service.floors(ctx, locationId);
  }

  @Get('menu')
  @RequirePermission('table.view')
  menu(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Query('locale', new ZodPipe(LocaleZ)) locale: string,
  ) {
    return this.service.getMenu(ctx, locationId, locale);
  }

  @Get('alerts')
  @RequirePermission('table.view')
  alerts(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Query('locale', new ZodPipe(LocaleZ)) locale: string,
    @CurrentPrincipal() user: Principal,
  ) {
    return this.service.alerts(ctx, locationId, locale, user.userId);
  }

  @Post('alerts/read')
  @RequirePermission('table.view')
  readAlerts(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Query('locale', new ZodPipe(LocaleZ)) locale: string,
    @CurrentPrincipal() user: Principal,
    @Body(new ZodPipe(AlertsReadZ)) body: AlertsRead,
  ) {
    return this.service.markAlertsRead(ctx, locationId, locale, user.userId, body.ids);
  }

  @Get('tables/:label')
  @RequirePermission('table.view')
  table(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('label') label: string,
  ) {
    return this.service.table(ctx, locationId, label);
  }

  @Put('tables/:label/seats/:seat')
  @RequirePermission('guest.record')
  saveSeat(
    @Tenant() ctx: TenantContext,
    @CurrentPrincipal() user: Principal,
    @Param('locationId') locationId: string,
    @Param('label') label: string,
    @Param('seat', new ZodPipe(SeatParamZ)) seat: number,
    @Body(new ZodPipe(SeatUpdateZ)) body: SeatUpdate,
  ) {
    return this.service.saveSeat(ctx, locationId, label, seat, body, user.userId);
  }

  @Post('tables/:label/seats/:seat/orders')
  @RequirePermission('order.create')
  order(
    @Tenant() ctx: TenantContext,
    @CurrentPrincipal() user: Principal,
    @Param('locationId') locationId: string,
    @Param('label') label: string,
    @Param('seat', new ZodPipe(SeatParamZ)) seat: number,
    @Body(new ZodPipe(OrderCreateZ)) body: OrderCreate,
  ) {
    return this.service.order(
      ctx,
      locationId,
      label,
      seat,
      body.dishId,
      user.userId,
      body.note,
      body.choices,
    );
  }

  @Delete('tables/:label/orders/:plateId')
  @RequirePermission('order.create')
  cancelOrder(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('label') label: string,
    @Param('plateId', new ZodPipe(z.uuid())) plateId: string,
  ) {
    return this.service.cancelOrder(ctx, locationId, label, plateId);
  }
}
