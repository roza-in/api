import { Module, Global, OnModuleInit, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import redisConfig from '../../config/redis.config';
import { QueueService } from './queue.service';

import {
  QUEUE_NOTIFICATIONS,
  QUEUE_WEBHOOKS,
  QUEUE_REPORTS,
  QUEUE_DOMAIN_VERIFICATION,
  QUEUE_COMPLIANCE,
} from './queue.constants';

export {
  QUEUE_NOTIFICATIONS,
  QUEUE_WEBHOOKS,
  QUEUE_REPORTS,
  QUEUE_DOMAIN_VERIFICATION,
  QUEUE_COMPLIANCE,
};

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
}

@Global()
@Module({
  imports: [
    ConfigModule.forFeature(redisConfig),

    // Root BullMQ connection — shared Redis for all queues
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = config.get<RedisConfig>('redis');
        if (!redis) {
          throw new Error('Redis configuration is missing');
        }
        return {
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password,
            db: redis.db,
            ...(redis.tls ? { tls: {} } : {}),
            maxRetriesPerRequest: null,
          },
        };
      },
    }),

    // Notifications queue — WhatsApp, SMS, Email delivery
    BullModule.registerQueue({
      name: QUEUE_NOTIFICATIONS,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 60_000, // 1 minute initial delay
        },
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    }),

    // Webhooks queue — async webhook processing (Razorpay, WhatsApp, MSG91)
    BullModule.registerQueue({
      name: QUEUE_WEBHOOKS,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 60_000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    }),

    // Reports queue — report generation (CSV, Excel, PDF)
    BullModule.registerQueue({
      name: QUEUE_REPORTS,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 120_000, // 2 minutes initial delay
        },
        removeOnComplete: { count: 50 },
        removeOnFail: false,
      },
    }),

    BullModule.registerQueue({
      name: QUEUE_DOMAIN_VERIFICATION,
      defaultJobOptions: {
        attempts: 10,
        backoff: {
          type: 'fixed',
          delay: 300_000, // 5 minutes fixed delay (DNS propagation is slow)
        },
        removeOnComplete: { count: 20 },
        removeOnFail: false,
      },
    }),

    // Compliance queue — data deletions and retention policies
    BullModule.registerQueue({
      name: QUEUE_COMPLIANCE,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60_000,
        },
        removeOnComplete: { count: 50 },
        removeOnFail: false,
      },
    }),
  ],
  providers: [QueueService],
  exports: [BullModule, QueueService],
})
export class QueueModule implements OnModuleInit {
  private readonly logger = new Logger(QueueModule.name);

  onModuleInit(): void {
    this.logger.log(
      'BullMQ queues registered: notifications, webhooks, reports, domain-verification, compliance',
    );
  }
}
