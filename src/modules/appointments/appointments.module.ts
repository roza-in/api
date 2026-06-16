import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AvailabilityService } from './availability.service';
import { ConflictService } from './conflict.service';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PermissionsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AvailabilityService, ConflictService],
  exports: [AppointmentsService, AvailabilityService],
})
export class AppointmentsModule {}
