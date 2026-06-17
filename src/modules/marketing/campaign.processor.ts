import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CampaignStatus } from '../../generated/prisma';

@Processor('campaigns')
@Injectable()
export class CampaignProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'dispatch-campaign') {
      const { campaignId, businessId, customerIds, variables } = job.data as {
        campaignId: string;
        businessId: string;
        customerIds: string[];
        variables: Record<string, string>;
      };

      await this.dispatchCampaign(
        campaignId,
        businessId,
        customerIds,
        variables,
      );
    }
  }

  private async dispatchCampaign(
    campaignId: string,
    businessId: string,
    customerIds: string[],
    variables: Record<string, string>,
  ) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, businessId, deletedAt: null },
      include: { business: true },
    });

    if (
      !campaign ||
      campaign.status === CampaignStatus.COMPLETED ||
      campaign.status === CampaignStatus.FAILED
    ) {
      this.logger.warn(
        `Campaign ${campaignId} not found or already in terminal state.`,
      );
      return;
    }

    try {
      // Update status to sending
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.SENDING },
      });

      // Fetch customers to resolve names
      const customers = await this.prisma.customer.findMany({
        where: {
          id: { in: customerIds },
          businessId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
        },
      });

      const customerMap = new Map(customers.map((c) => [c.id, c]));

      let sentCount = 0;

      for (const customerId of customerIds) {
        const customer = customerMap.get(customerId);
        if (!customer) {
          this.logger.warn(
            `Customer ${customerId} not found or soft-deleted. Skipping.`,
          );
          continue;
        }

        try {
          // NotificationsService.send takes care of rate limits, consent, creating Notification DB logs, and queueing dispatch
          await this.notificationsService.send({
            businessId,
            customerId,
            templateId: campaign.messageTemplate,
            variables: {
              ...variables,
              customerName: customer.name,
              businessName: campaign.business.name,
            },
            preferredChannel: campaign.channel as 'whatsapp' | 'sms',
            campaignId: campaign.id,
          });

          sentCount++;
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Skipping customer ${customerId} in campaign ${campaignId}: ${errMsg}`,
          );
        }
      }

      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: CampaignStatus.COMPLETED,
          sentCount,
        },
      });

      this.logger.log(
        `Campaign ${campaignId} finished dispatch. Sent messages count: ${sentCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process campaign ${campaignId}`,
        error instanceof Error ? error.stack : String(error),
      );

      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.FAILED },
      });

      throw error;
    }
  }
}
