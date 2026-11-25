import { Module } from '@nestjs/common';
import { MenuRepository } from './menu.repository.js';
import { ServiceController } from './service.controller.js';
import { ServiceRepository } from './service.repository.js';
import { ServiceService } from './service.service.js';

@Module({
  controllers: [ServiceController],
  providers: [ServiceService, ServiceRepository, MenuRepository],
})
export class ServiceModule {}
