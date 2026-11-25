import { Module } from '@nestjs/common';
import { GuestController } from './guest.controller.js';
import { GuestRepository } from './guest.repository.js';
import { GuestService } from './guest.service.js';

@Module({
  controllers: [GuestController],
  providers: [GuestService, GuestRepository],
})
export class GuestModule {}
