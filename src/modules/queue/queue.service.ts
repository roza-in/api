import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NOTIFICATIONS,
  QUEUE_WEBHOOKS,
  QUEUE_REPORTS,
  QUEUE_DOMAIN_VERIFICATION,
  QUEUE_COMPLIANCE,
} from './queue.constants';

export interface QueueHealthStatus {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUE_NOTIFICATIONS)
    private readonly notificationsQueue: Queue,

    @InjectQueue(QUEUE_WEBHOOKS)
    private readonly webhooksQueue: Queue,

    @InjectQueue(QUEUE_REPORTS)
    private readonly reportsQueue: Queue,

    @InjectQueue(QUEUE_DOMAIN_VERIFICATION)
    private readonly domainVerificationQueue: Queue,

    @InjectQueue(QUEUE_COMPLIANCE)
    private readonly complianceQueue: Queue,
  ) {}

  async getQueueHealth(): Promise<QueueHealthStatus[]> {
    const queues = [
      this.notificationsQueue,
      this.webhooksQueue,
      this.reportsQueue,
      this.domainVerificationQueue,
      this.complianceQueue,
    ];

    const results: QueueHealthStatus[] = [];

    for (const queue of queues) {
      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all(
          [
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount(),
          ],
        );

        results.push({
          name: queue.name,
          waiting,
          active,
          completed,
          failed,
          delayed,
        });
      } catch (error) {
        this.logger.error(
          `Failed to get health for queue ${queue.name}`,
          error instanceof Error ? error.stack : String(error),
        );
        results.push({
          name: queue.name,
          waiting: -1,
          active: -1,
          completed: -1,
          failed: -1,
          delayed: -1,
        });
      }
    }

    return results;
  }

  /** Returns all registered queue instances for Bull Board or other integrations */
  getAllQueues(): Queue[] {
    return [
      this.notificationsQueue,
      this.webhooksQueue,
      this.reportsQueue,
      this.domainVerificationQueue,
      this.complianceQueue,
    ];
  }
}
