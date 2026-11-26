import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { PinLoginZ, SignupZ, type PinLogin, type Signup } from '@plateguard/contracts';
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

  /** The sign-in screen of a location's devices. Public: the location only, no names. */
  @Get('auth/locations/:slug')
  signInLocation(@Param('slug') slug: string) {
    return this.auth.signInLocation(slug);
  }

  @Post('auth/pin')
  @HttpCode(200)
  pin(@Body(new ZodPipe(PinLoginZ)) body: PinLogin) {
    return this.auth.loginWithPin(body);
  }

  /** The free start: a new restaurant with its owner, signed in. Public. */
  @Post('auth/signup')
  @HttpCode(201)
  signup(@Body(new ZodPipe(SignupZ)) body: Signup) {
    return this.auth.signup(body);
  }
}
