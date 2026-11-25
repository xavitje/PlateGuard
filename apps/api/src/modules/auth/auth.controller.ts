import { Controller, Get } from '@nestjs/common';
import type { Principal } from '@plateguard/domain';
import { AuthService } from './auth.service.js';
import { CurrentPrincipal } from './permissions.js';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  me(@CurrentPrincipal() principal: Principal) {
    return this.auth.me(principal);
  }
}
