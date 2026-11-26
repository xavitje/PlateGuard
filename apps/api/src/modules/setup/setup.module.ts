import { Module } from '@nestjs/common';
import { FloorplanRepository } from './floorplan.repository.js';
import { FloorplanService } from './floorplan.service.js';
import { LocationsRepository } from './locations.repository.js';
import { LocationsService } from './locations.service.js';
import { ProfileRepository } from './profile.repository.js';
import { ProfileService } from './profile.service.js';
import {
  FloorplanController,
  LocationsController,
  ProfileController,
  StaffController,
} from './setup.controller.js';
import { StaffRepository } from './staff.repository.js';
import { StaffService } from './staff.service.js';

@Module({
  controllers: [FloorplanController, StaffController, ProfileController, LocationsController],
  providers: [
    FloorplanService,
    FloorplanRepository,
    StaffService,
    StaffRepository,
    ProfileRepository,
    ProfileService,
    LocationsRepository,
    LocationsService,
  ],
  exports: [StaffRepository],
})
export class SetupModule {}
