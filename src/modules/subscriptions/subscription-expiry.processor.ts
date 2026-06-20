import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionStatus } from '../../generated/prisma';
import { EmailAdapter } from '../notifications/adapters/email.adapter';
import { TemplateService } from '../notifications/template.service';

@Processor('subscriptions')
export class SubscriptionExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(SubscriptionExpiryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAdapter: EmailAdapter,
    private readonly templateService: TemplateService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'check-expired-subscriptions') {
      await this.checkExpiredSubscriptions();
      await this.checkExpiringSubscriptions();
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

  private async checkExpiringSubscriptions() {
    const now = new Date();
    // Check for subscriptions/trials expiring in exactly 3 days (within a 24-hour window 3 days from now)
    const threeDaysStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const threeDaysEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const expiringSubscriptions = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIALING'] },
        currentPeriodEnd: {
          gte: threeDaysStart,
          lte: threeDaysEnd,
        },
      },
      include: {
        business: {
          include: {
            members: {
              where: { role: { name: 'OWNER' } },
              include: { user: true },
            },
          },
        },
      },
    });

    this.logger.log(
      `Found ${expiringSubscriptions.length} expiring subscriptions (in 3 days) to process.`,
    );

    for (const sub of expiringSubscriptions) {
      const owner = sub.business.members[0]?.user;
      if (owner && owner.email) {
        try {
          const daysRemaining = Math.max(
            1,
            Math.ceil(
              (sub.currentPeriodEnd.getTime() - now.getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          );

          const renderResult = this.templateService.render(
            'TRIAL_REMINDER',
            {
              ownerName: owner.name || owner.email.split('@')[0] || 'Owner',
              daysRemaining: daysRemaining.toString(),
            },
            'email',
          );

          if (renderResult.email) {
            await this.emailAdapter.sendEmail(
              owner.email,
              renderResult.email.subject,
              renderResult.email.html,
            );
            this.logger.log(
              `Sent trial/expiration reminder email to owner of business ${sub.businessId} (${owner.email})`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to send expiration reminder email to owner for subscription ${sub.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    }
  }
}
