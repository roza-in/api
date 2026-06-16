import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ExportsService } from './exports.service';
import { ReportsProcessor } from './reports.processor';
import { StorageModule } from '../storage/storage.module';
import { QUEUE_REPORTS } from '../queue/queue.constants';

@Module({
  imports: [
    StorageModule,
    BullModule.registerQueue({
      name: QUEUE_REPORTS,
    }),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, ExportsService, ReportsProcessor],
  exports: [AnalyticsService, ExportsService],
})
export class AnalyticsModule {}
