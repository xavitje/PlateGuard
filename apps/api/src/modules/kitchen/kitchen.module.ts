import { Module } from '@nestjs/common';
import { MenuRepository } from '../service/menu.repository.js';
import { ServiceRepository } from '../service/service.repository.js';
import { KitchenController } from './kitchen.controller.js';
import { KitchenService } from './kitchen.service.js';

@Module({
  controllers: [KitchenController],
  providers: [KitchenService, ServiceRepository, MenuRepository],
})
export class KitchenModule {}
