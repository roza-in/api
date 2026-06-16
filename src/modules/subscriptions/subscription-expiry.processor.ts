import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionStatus } from '../../generated/prisma';

@Processor('subscriptions')
export class SubscriptionExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(SubscriptionExpiryProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'check-expired-subscriptions') {
      await this.checkExpiredSubscriptions();
    }
  }

  private async checkExpiredSubscriptions() {
    const now = new Date();

    const expiredSubscriptions = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIALING'] },
        currentPeriodEnd: { lt: now },
      },
    });

    this.logger.log(
      `Found ${expiredSubscriptions.length} expired subscriptions to process.`,
    );

    const freeTrialPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { slug: 'free-trial' },
    });

    for (const sub of expiredSubscriptions) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.subscription.update({
            where: { id: sub.id },
            data: { status: SubscriptionStatus.CANCELLED },
          });

          await tx.business.update({
            where: { id: sub.businessId },
            data: {
              planId: freeTrialPlan?.id || null,
              subscriptionStatus: SubscriptionStatus.CANCELLED,
            },
          });

          await tx.auditLog.create({
            data: {
              businessId: sub.businessId,
              userId: sub.businessId,
              action: 'UPDATE',
              entity: 'Subscription',
              entityId: sub.id,
              metadata: {
                reason: 'Auto-expired by cron scheduler',
                oldStatus: sub.status,
                newStatus: SubscriptionStatus.CANCELLED,
              },
            },
          });
        });

        this.logger.log(
          `Successfully processed expiration for subscription ${sub.id} (business: ${sub.businessId})`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to process expiration for subscription ${sub.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
