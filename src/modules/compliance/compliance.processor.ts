import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ComplianceService } from './compliance.service';
import { QUEUE_COMPLIANCE } from '../queue/queue.constants';

@Processor(QUEUE_COMPLIANCE)
export class ComplianceProcessor extends WorkerHost {
  private readonly logger = new Logger(ComplianceProcessor.name);

  constructor(private readonly complianceService: ComplianceService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing compliance job: ${job.name} (${job.id})`);

    if (job.name === 'compliance-daily-check') {
      try {
        const deletionsResult =
          await this.complianceService.executeScheduledDeletions();
        this.logger.log(
          `Executed scheduled deletions: ${deletionsResult.processed} requests processed`,
        );

        const retentionResult =
          await this.complianceService.runRetentionCleanup();
        this.logger.log(
          `Executed data retention cleanup: ${retentionResult.cleanedUp} businesses cleaned up`,
        );
      } catch (error) {
        this.logger.error(
          `Daily compliance check failed`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }
    } else {
      this.logger.warn(`Unknown compliance job name: ${job.name}`);
    }
  }
}
