import { Module } from '@nestjs/common';
import { IncidentController } from './incident.controller.js';
import { IncidentRepository } from './incident.repository.js';
import { IncidentService } from './incident.service.js';

/** Allergy incidents: the report with frozen facts, the follow-up, the PDF. */
@Module({
  controllers: [IncidentController],
  providers: [IncidentService, IncidentRepository],
})
export class IncidentModule {}
