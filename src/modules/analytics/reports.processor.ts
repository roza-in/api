import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import Redis from 'ioredis';
import { ExportsService } from './exports.service';
import { QUEUE_REPORTS } from '../queue/queue.constants';

@Processor(QUEUE_REPORTS)
export class ReportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportsProcessor.name);
  private readonly redis: Redis;

  constructor(
    private readonly exportsService: ExportsService,
    private readonly configService: ConfigService,
  ) {
    super();
    const redisUrl = this.configService.getOrThrow<string>('REDIS_URL');
    this.redis = new Redis(redisUrl);
  }

  async process(job: Job): Promise<void> {
    const data = job.data as {
      businessId: string;
      userId: string;
      reportType: 'appointments' | 'revenue' | 'customers';
      startDate?: string;
      endDate?: string;
      format: 'csv' | 'xlsx' | 'pdf';
      jobId: string;
    };

    const {
      businessId,
      userId,
      reportType,
      startDate,
      endDate,
      format,
      jobId,
    } = data;
    this.logger.log(`Processing report generation for job ID: ${jobId}`);

    try {
      const fileUrl = await this.exportsService.exportReport(
        businessId,
        userId,
        reportType,
        startDate,
        endDate,
        format,
      );

      await this.redis.set(
        `reports:status:${jobId}`,
        JSON.stringify({
          status: 'COMPLETED',
          fileUrl,
          metadata: {
            reportType,
            startDate,
            endDate,
            format,
            generatedAt: new Date().toISOString(),
          },
        }),
        'EX',
        86400, // 24 hours
      );

      this.logger.log(`Report generation completed for job ID: ${jobId}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Report generation failed for job ID: ${jobId}`,
        error instanceof Error ? error.stack : undefined,
      );

      await this.redis.set(
        `reports:status:${jobId}`,
        JSON.stringify({
          status: 'FAILED',
          error: errMsg,
          metadata: {
            reportType,
            startDate,
            endDate,
            format,
            failedAt: new Date().toISOString(),
          },
        }),
        'EX',
        86400,
      );

      throw error;
    }
  }
}
