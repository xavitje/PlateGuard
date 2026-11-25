import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import {
  FloorInputZ,
  FloorLayoutZ,
  FloorOrderZ,
  StaffInputZ,
  StaffPinZ,
  TableInputZ,
  type FloorInput,
  type FloorLayout,
  type StaffInput,
  type TableInput,
} from '@plateguard/contracts';
import type { Principal } from '@plateguard/domain';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe.js';
import {
  CurrentPrincipal,
  RequirePermission,
  Tenant,
  type AuthedRequest,
  type TenantContext,
} from '../auth/permissions.js';
import { FloorplanService } from './floorplan.service.js';
import { StaffService } from './staff.service.js';

const IdPipe = new ZodPipe(z.uuid());

/** The floor plan of a location. */
@Controller('locations/:locationId/admin')
@RequirePermission('floorplan.edit')
export class FloorplanController {
  constructor(private readonly floorplan: FloorplanService) {}

  @Get('floors')
  floors(@Tenant() ctx: TenantContext, @Param('locationId') locationId: string) {
    return this.floorplan.floors(ctx, locationId);
  }

  @Post('floors')
  createFloor(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Body(new ZodPipe(FloorInputZ)) body: FloorInput,
  ) {
    return this.floorplan.saveFloor(ctx, locationId, null, body);
  }

  @Put('floors/order')
  orderFloors(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Body(new ZodPipe(FloorOrderZ)) body: { floorIds: string[] },
  ) {
    return this.floorplan.orderFloors(ctx, locationId, body.floorIds);
  }

  @Put('floors/:id/layout')
  layout(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(FloorLayoutZ)) body: FloorLayout,
  ) {
    return this.floorplan.layout(ctx, locationId, id, body);
  }

  @Put('floors/:id')
  updateFloor(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(FloorInputZ)) body: FloorInput,
  ) {
    return this.floorplan.saveFloor(ctx, locationId, id, body);
  }

  @Post('tables')
  createTable(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Body(new ZodPipe(TableInputZ)) body: TableInput,
  ) {
    return this.floorplan.saveTable(ctx, locationId, null, body);
  }

  @Put('tables/:id')
  updateTable(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(TableInputZ)) body: TableInput,
  ) {
    return this.floorplan.saveTable(ctx, locationId, id, body);
  }
}

/** The people who work at a location. */
@Controller('locations/:locationId/admin/staff')
@RequirePermission('staff.manage')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(@Tenant() ctx: TenantContext, @Req() req: AuthedRequest) {
    return this.staff.list(ctx, req.location!);
  }

  @Post()
  create(
    @Tenant() ctx: TenantContext,
    @CurrentPrincipal() user: Principal,
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(StaffInputZ)) body: StaffInput,
  ) {
    return this.staff.create(ctx, user, req.location!, body);
  }

  @Put(':id')
  update(
    @Tenant() ctx: TenantContext,
    @CurrentPrincipal() user: Principal,
    @Req() req: AuthedRequest,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(StaffInputZ.omit({ pin: true }))) body: Omit<StaffInput, 'pin'>,
  ) {
    return this.staff.update(ctx, user, req.location!, id, body);
  }

  @Put(':id/pin')
  setPin(
    @Tenant() ctx: TenantContext,
    @CurrentPrincipal() user: Principal,
    @Req() req: AuthedRequest,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(StaffPinZ)) body: { pin: string },
  ) {
    return this.staff.setPin(ctx, user, req.location!, id, body.pin);
  }

  @Delete(':id')
  remove(
    @Tenant() ctx: TenantContext,
    @CurrentPrincipal() user: Principal,
    @Req() req: AuthedRequest,
    @Param('id', IdPipe) id: string,
  ) {
    return this.staff.remove(ctx, user, req.location!, id);
  }
}
