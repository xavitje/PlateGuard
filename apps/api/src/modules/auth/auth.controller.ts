import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { PinLoginZ, type PinLogin } from '@plateguard/contracts';
import type { Principal } from '@plateguard/domain';
import { ZodPipe } from '../../common/zod.pipe.js';
import { AuthService } from './auth.service.js';
import { CurrentPrincipal, type AuthedRequest } from './permissions.js';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  me(@CurrentPrincipal() principal: Principal, @Req() req: AuthedRequest) {
    return this.auth.me(principal, req.sessionLocation);
  }

  /** The sign-in screen of a location's devices. Public: names only, no roles. */
  @Get('auth/locations/:slug/staff')
  staff(@Param('slug') slug: string) {
    return this.auth.staff(slug);
  }

  @Post('auth/pin')
  @HttpCode(200)
  pin(@Body(new ZodPipe(PinLoginZ)) body: PinLogin) {
    return this.auth.loginWithPin(body);
  }
}
