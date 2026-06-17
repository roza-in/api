import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NOTIFICATIONS } from '../queue/queue.constants';

@Injectable()
export class NotificationsCronScheduler implements OnModuleInit {
  private readonly logger = new Logger(NotificationsCronScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NOTIFICATIONS)
    private readonly notificationsQueue: Queue,
  ) {}

  async onModuleInit() {
    try {
      // Register hourly repeatable appointment reminder check job
      await this.notificationsQueue.add(
        'appointment-reminder-check',
        {},
        {
          repeat: {
            pattern: '0 * * * *', // Run every hour at minute 0
          },
        },
      );
      this.logger.log('Hourly appointment reminder check job scheduled.');
    } catch (error) {
      this.logger.error(
        'Failed to schedule hourly appointment reminder check job',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
