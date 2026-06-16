import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_COMPLIANCE } from '../queue/queue.constants';

@Injectable()
export class ComplianceCronScheduler implements OnModuleInit {
  private readonly logger = new Logger(ComplianceCronScheduler.name);

  constructor(
    @InjectQueue(QUEUE_COMPLIANCE) private readonly complianceQueue: Queue,
  ) {}

  async onModuleInit() {
    try {
      // Register daily repeatable compliance check run at midnight
      await this.complianceQueue.add(
        'compliance-daily-check',
        {},
        {
          repeat: {
            pattern: '0 0 * * *',
          },
        },
      );
      this.logger.log('Daily compliance audit check job scheduled.');
    } catch (error) {
      this.logger.error(
        'Failed to schedule daily compliance audit check job',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
