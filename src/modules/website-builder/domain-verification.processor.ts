import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DomainsService } from './domains.service';
import { QUEUE_DOMAIN_VERIFICATION } from '../queue/queue.constants';

@Processor(QUEUE_DOMAIN_VERIFICATION)
export class DomainVerificationProcessor extends WorkerHost {
  private readonly logger = new Logger(DomainVerificationProcessor.name);

  constructor(private readonly domainsService: DomainsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    const data = job.data as { domainId: string };
    const { domainId } = data;
    this.logger.log(
      `Processing DNS verification job for domain ID: ${domainId}`,
    );
    try {
      await this.domainsService.verifyDns(domainId);
      this.logger.log(`DNS verification completed for domain ID: ${domainId}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.stack : String(error);
      this.logger.error(
        `DNS verification job failed for domain ID: ${domainId}`,
        errMsg,
      );
      throw error;
    }
  }
}
