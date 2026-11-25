import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { SessionGuard } from './session.guard.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, SessionGuard],
  exports: [AuthRepository, SessionGuard],
})
export class AuthModule {}
