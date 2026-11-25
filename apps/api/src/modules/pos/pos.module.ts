import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module.js';
import { MenuRepository } from '../service/menu.repository.js';
import { ServiceRepository } from '../service/service.repository.js';
import { ServiceService } from '../service/service.service.js';
import { PosController } from './pos.controller.js';
import { PosRepository } from './pos.repository.js';
import { PosService } from './pos.service.js';

/** Orders from the restaurant's till (for now a Square test account) as plates on seats. */
@Module({
  imports: [IntegrationsModule],
  controllers: [PosController],
  providers: [PosService, PosRepository, ServiceService, ServiceRepository, MenuRepository],
})
export class PosModule {}
