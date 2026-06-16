import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MarketingService } from './marketing.service';
import { MarketingController } from './marketing.controller';
import { CampaignProcessor } from './campaign.processor';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    // Register the campaigns queue
    BullModule.registerQueue({
      name: 'campaigns',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60_000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    }),
    NotificationsModule,
  ],
  controllers: [MarketingController],
  providers: [MarketingService, CampaignProcessor],
  exports: [MarketingService],
})
export class MarketingModule {}
