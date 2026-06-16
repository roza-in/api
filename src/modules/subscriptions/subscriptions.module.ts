import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionAdapterFactory } from './subscription-adapter.factory';
import { SubscriptionExpiryProcessor } from './subscription-expiry.processor';
import { SubscriptionCronScheduler } from './subscription-cron.scheduler';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'subscriptions',
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    }),
  ],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    SubscriptionAdapterFactory,
    SubscriptionExpiryProcessor,
    SubscriptionCronScheduler,
  ],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
