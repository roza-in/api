import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AvailabilityService } from './availability.service';
import { ConflictService } from './conflict.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PermissionsModule, NotificationsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AvailabilityService, ConflictService],
  exports: [AppointmentsService, AvailabilityService],
})
export class AppointmentsModule {}
