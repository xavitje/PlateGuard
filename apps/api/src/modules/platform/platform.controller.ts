import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  PlatformLoginZ,
  PlatformNewRestaurantZ,
  PlatformPlanZ,
  StaffInputZ,
  StaffPinZ,
  type PlatformLogin,
  type PlatformMe,
  type StaffInput,
} from '@plateguard/contracts';
import type { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentPlatformAdmin, PlatformGuard } from './platform.guard.js';
import { PlatformService } from './platform.service.js';
import { RestaurantsService } from './restaurants.service.js';

type Admin = { email: string };
const uuid = new ParseUUIDPipe();

/** Platform administration: running PlateGuard itself, apart from every restaurant. */
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodPipe(PlatformLoginZ)) body: PlatformLogin) {
    return this.platform.login(body);
  }

  @Get('me')
  @UseGuards(PlatformGuard)
  me(@CurrentPlatformAdmin() admin: Admin): PlatformMe {
    return { email: admin.email };
  }
}

/** Restaurants and their people, for the platform admin only. */
@Controller('platform')
@UseGuards(PlatformGuard)
export class PlatformRestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Get('restaurants')
  list() {
    return this.restaurants.list();
  }

  @Post('restaurants')
  @HttpCode(201)
  create(
    @CurrentPlatformAdmin() admin: Admin,
    @Body(new ZodPipe(PlatformNewRestaurantZ)) body: z.infer<typeof PlatformNewRestaurantZ>,
  ) {
    return this.restaurants.create(admin.email, body);
  }

  @Put('restaurants/:id/plan')
  setPlan(
    @CurrentPlatformAdmin() admin: Admin,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(PlatformPlanZ)) body: z.infer<typeof PlatformPlanZ>,
  ) {
    return this.restaurants.setPlan(admin.email, id, body.plan);
  }

  @Get('locations/:id/staff')
  staff(@Param('id', uuid) id: string) {
    return this.restaurants.staffOf(id);
  }

  @Post('locations/:id/staff')
  addStaff(
    @CurrentPlatformAdmin() admin: Admin,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(StaffInputZ)) body: StaffInput,
  ) {
    return this.restaurants.addStaff(admin.email, id, body);
  }

  @Put('locations/:id/staff/:userId/pin')
  setPin(
    @CurrentPlatformAdmin() admin: Admin,
    @Param('id', uuid) id: string,
    @Param('userId', uuid) userId: string,
    @Body(new ZodPipe(StaffPinZ)) body: z.infer<typeof StaffPinZ>,
  ) {
    return this.restaurants.setPin(admin.email, id, userId, body.pin);
  }
}
