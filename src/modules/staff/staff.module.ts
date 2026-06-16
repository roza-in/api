import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    PermissionsModule,
    BullModule.registerQueue({
      name: 'notifications',
    }),
  ],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
