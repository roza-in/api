import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class SubscriptionCronScheduler implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionCronScheduler.name);

  constructor(@InjectQueue('subscriptions') private readonly queue: Queue) {}

  async onModuleInit() {
    try {
      // Clean up previous repeatable configurations if any, and set daily midnight run
      await this.queue.add(
        'check-expired-subscriptions',
        {},
        {
          repeat: {
            pattern: '0 0 * * *',
          },
        },
      );
      this.logger.log('Daily subscription expiration check job scheduled.');
    } catch (error) {
      this.logger.error(
        'Failed to schedule subscription expiration check job',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
