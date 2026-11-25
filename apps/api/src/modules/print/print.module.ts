import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module.js';
import { KitchenService } from '../kitchen/kitchen.service.js';
import { MenuRepository } from '../service/menu.repository.js';
import { ServiceRepository } from '../service/service.repository.js';
import { CloudPrntController, PrintController } from './print.controller.js';
import { PrintRepository } from './print.repository.js';
import { PrintService } from './print.service.js';

/** Allergy tickets on the kitchen's own printer, for kitchens without a screen. */
@Module({
  imports: [IntegrationsModule],
  controllers: [CloudPrntController, PrintController],
  providers: [PrintService, PrintRepository, KitchenService, ServiceRepository, MenuRepository],
})
export class PrintModule {}
