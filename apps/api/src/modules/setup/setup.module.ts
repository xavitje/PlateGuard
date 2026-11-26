import { Module } from '@nestjs/common';
import { FloorplanRepository } from './floorplan.repository.js';
import { FloorplanService } from './floorplan.service.js';
import { ProfileRepository } from './profile.repository.js';
import { ProfileService } from './profile.service.js';
import { FloorplanController, ProfileController, StaffController } from './setup.controller.js';
import { StaffRepository } from './staff.repository.js';
import { StaffService } from './staff.service.js';

@Module({
  controllers: [FloorplanController, StaffController, ProfileController],
  providers: [
    FloorplanService,
    FloorplanRepository,
    StaffService,
    StaffRepository,
    ProfileRepository,
    ProfileService,
  ],
  exports: [StaffRepository],
})
export class SetupModule {}
