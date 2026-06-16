import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ComplianceService } from './compliance.service';
import { ComplianceController } from './compliance.controller';
import { ComplianceCronScheduler } from './compliance-cron.scheduler';
import { ComplianceProcessor } from './compliance.processor';
import { QUEUE_COMPLIANCE } from '../queue/queue.constants';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    // Register the compliance queue
    BullModule.registerQueue({
      name: QUEUE_COMPLIANCE,
    }),
    NotificationsModule,
    StorageModule,
    PermissionsModule,
  ],
  controllers: [ComplianceController],
  providers: [ComplianceService, ComplianceCronScheduler, ComplianceProcessor],
  exports: [ComplianceService],
})
export class ComplianceModule {}
