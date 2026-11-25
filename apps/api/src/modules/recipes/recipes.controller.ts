import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import {
  ComponentInputZ,
  DishInputZ,
  EquipmentInputZ,
  IngredientInputZ,
  MenuImportInputZ,
  MenuItemsZ,
  type ComponentInput,
  type DishInput,
  type EquipmentInput,
  type IngredientInput,
  type MenuImportInput,
  type MenuItems,
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
import { MenuImportService } from './menu-import.service.js';
import { RecipesService } from './recipes.service.js';

const IdPipe = new ZodPipe(z.uuid());
const LocaleZ = z.enum(['en', 'nl']).catch('en');

/** The recipe database and the menu of a location. Everything here needs menu.edit at least. */
@Controller('locations/:locationId/admin')
@RequirePermission('menu.edit')
export class RecipesController {
  constructor(
    private readonly recipes: RecipesService,
    private readonly menuImport: MenuImportService,
  ) {}

  @Get('allergens')
  allergens(@Tenant() ctx: TenantContext, @Query('locale', new ZodPipe(LocaleZ)) locale: string) {
    return this.recipes.allergens(ctx, locale);
  }

  @Get('ingredients')
  ingredients(@Tenant() ctx: TenantContext) {
    return this.recipes.ingredients(ctx);
  }

  @Post('ingredients')
  createIngredient(
    @Tenant() ctx: TenantContext,
    @CurrentPrincipal() user: Principal,
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(IngredientInputZ)) body: IngredientInput,
  ) {
    return this.recipes.saveIngredient(ctx, user, req.location!, null, body);
  }

  @Put('ingredients/:id')
  updateIngredient(
    @Tenant() ctx: TenantContext,
    @CurrentPrincipal() user: Principal,
    @Req() req: AuthedRequest,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(IngredientInputZ)) body: IngredientInput,
  ) {
    return this.recipes.saveIngredient(ctx, user, req.location!, id, body);
  }

  @Get('equipment')
  equipment(@Tenant() ctx: TenantContext) {
    return this.recipes.equipment(ctx);
  }

  @Post('equipment')
  createEquipment(
    @Tenant() ctx: TenantContext,
    @Body(new ZodPipe(EquipmentInputZ)) body: EquipmentInput,
  ) {
    return this.recipes.saveEquipment(ctx, null, body);
  }

  @Put('equipment/:id')
  updateEquipment(
    @Tenant() ctx: TenantContext,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(EquipmentInputZ)) body: EquipmentInput,
  ) {
    return this.recipes.saveEquipment(ctx, id, body);
  }

  @Get('components')
  components(@Tenant() ctx: TenantContext) {
    return this.recipes.components(ctx);
  }

  @Post('components')
  createComponent(
    @Tenant() ctx: TenantContext,
    @Body(new ZodPipe(ComponentInputZ)) body: ComponentInput,
  ) {
    return this.recipes.saveComponent(ctx, null, body);
  }

  @Put('components/:id')
  updateComponent(
    @Tenant() ctx: TenantContext,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(ComponentInputZ)) body: ComponentInput,
  ) {
    return this.recipes.saveComponent(ctx, id, body);
  }

  @Get('dishes')
  dishes(@Tenant() ctx: TenantContext, @Param('locationId') locationId: string) {
    return this.recipes.dishes(ctx, locationId);
  }

  @Post('dishes')
  createDish(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Body(new ZodPipe(DishInputZ)) body: DishInput,
  ) {
    return this.recipes.saveDish(ctx, locationId, null, body);
  }

  @Put('dishes/:id')
  updateDish(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(DishInputZ)) body: DishInput,
  ) {
    return this.recipes.saveDish(ctx, locationId, id, body);
  }

  @Get('menu')
  menu(@Tenant() ctx: TenantContext, @Param('locationId') locationId: string) {
    return this.recipes.menu(ctx, locationId);
  }

  @Put('menu/items')
  setMenuItems(
    @Tenant() ctx: TenantContext,
    @Param('locationId') locationId: string,
    @Body(new ZodPipe(MenuItemsZ)) body: MenuItems,
  ) {
    return this.recipes.setMenuItems(ctx, locationId, body.dishIds);
  }

  /** Reads dishes from photos or a PDF of a menu. Saves nothing: the owner checks and imports. */
  @Post('menu/import')
  async importMenu(
    @Tenant() ctx: TenantContext,
    @Body(new ZodPipe(MenuImportInputZ)) body: MenuImportInput,
  ) {
    const codes = (await this.recipes.allergens(ctx, 'en')).map((a) => a.code);
    return this.menuImport.extract(body, codes);
  }

  @Post('menu/publish')
  @RequirePermission('menu.publish')
  publish(
    @Tenant() ctx: TenantContext,
    @CurrentPrincipal() user: Principal,
    @Param('locationId') locationId: string,
  ) {
    return this.recipes.publish(ctx, locationId, user.userId);
  }
}
