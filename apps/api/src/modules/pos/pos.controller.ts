import { Body, Controller, Delete, Get, Post, Put, Param } from '@nestjs/common';
import {
  PosConnectInputZ,
  PosMappingInputZ,
  PosTestOrderInputZ,
  PosWebhookInputZ,
  type PosConnectInput,
  type PosMappingInput,
  type PosTestOrderInput,
  type PosWebhookInput,
} from '@plateguard/contracts';
import type { Principal } from '@plateguard/domain';
import { ZodPipe } from '../../common/zod.pipe.js';
import {
  CurrentPrincipal,
  RequirePermission,
  Tenant,
  type TenantContext,
} from '../auth/permissions.js';
import { PosService } from './pos.service.js';

/** The POS link in admin: connect, webhook, item links, a test order, pulling orders. */
@Controller('locations/:locationId/admin/pos')
export class PosController {
  constructor(private readonly pos: PosService) {}

  @Get()
  @RequirePermission('integrations.manage')
  status(@Tenant() ctx: TenantContext, @Param('locationId') locationId: string) {
    return this.pos.status(ctx, locationId);
  }

  @Post()
  @RequirePermission('integrations.manage')
  connect(
    @Tenant() ctx: TenantContext,
    @CurrentPrincipal() user: Principal,
    @Param('locationId') locationId: string,
    @Body(new ZodPipe(PosConnectInputZ)) body: PosConnectInput,
  ) {
    return this.pos.connect(ctx, locationId, body, user.userId);
  }

  @Put('webhook')
  @RequirePermission('integrations.manage')
  webhook(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Body(new ZodPipe(PosWebhookInputZ)) body: PosWebhookInput,
  ) {
    return this.pos.setWebhook(ctx, locationId, body);
  }

  @Delete()
  @RequirePermission('integrations.manage')
  disconnect(@Tenant() ctx: TenantContext, @Param('locationId') locationId: string) {
    return this.pos.disconnect(ctx, locationId);
  }

  @Get('items')
  @RequirePermission('integrations.manage')
  items(@Tenant() ctx: TenantContext, @Param('locationId') locationId: string) {
    return this.pos.items(ctx, locationId);
  }

  @Put('items')
  @RequirePermission('integrations.manage')
  map(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Body(new ZodPipe(PosMappingInputZ)) body: PosMappingInput,
  ) {
    return this.pos.map(ctx, locationId, body);
  }

  @Post('items/push')
  @RequirePermission('integrations.manage')
  pushMenu(@Tenant() ctx: TenantContext, @Param('locationId') locationId: string) {
    return this.pos.pushMenu(ctx, locationId);
  }

  @Post('test-order')
  @RequirePermission('integrations.manage')
  testOrder(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Body(new ZodPipe(PosTestOrderInputZ)) body: PosTestOrderInput,
  ) {
    return this.pos.testOrder(ctx, locationId, body);
  }

  @Post('sync')
  @RequirePermission('integrations.manage')
  sync(@Tenant() ctx: TenantContext, @Param('locationId') locationId: string) {
    return this.pos.sync(ctx, locationId);
  }

  @Get('events')
  @RequirePermission('integrations.manage')
  events(@Tenant() ctx: TenantContext, @Param('locationId') locationId: string) {
    return this.pos.events(ctx, locationId);
  }
}
