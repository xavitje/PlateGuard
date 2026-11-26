import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { PlatformLoginZ, type PlatformLogin, type PlatformMe } from '@plateguard/contracts';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentPlatformAdmin, PlatformGuard } from './platform.guard.js';
import { PlatformService } from './platform.service.js';

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
  me(@CurrentPlatformAdmin() admin: { email: string }): PlatformMe {
    return { email: admin.email };
  }
}
