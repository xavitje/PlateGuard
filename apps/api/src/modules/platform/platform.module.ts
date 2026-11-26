import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller.js';
import { PlatformGuard } from './platform.guard.js';
import { PlatformRepository } from './platform.repository.js';
import { PlatformService } from './platform.service.js';

@Module({
  controllers: [PlatformController],
  providers: [PlatformRepository, PlatformService, PlatformGuard],
})
export class PlatformModule {}
