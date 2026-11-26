import { Module } from '@nestjs/common';
import { SetupModule } from '../setup/setup.module.js';
import { PlatformController, PlatformRestaurantsController } from './platform.controller.js';
import { PlatformGuard } from './platform.guard.js';
import { PlatformRepository } from './platform.repository.js';
import { PlatformService } from './platform.service.js';
import { RestaurantsService } from './restaurants.service.js';

@Module({
  imports: [SetupModule],
  controllers: [PlatformController, PlatformRestaurantsController],
  providers: [PlatformRepository, PlatformService, RestaurantsService, PlatformGuard],
})
export class PlatformModule {}
