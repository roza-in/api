import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { QUEUE_WEBHOOKS } from '../queue/queue.constants';
import { NotificationsService } from '../notifications/notifications.service';
import {
  PaymentStatus,
  WebhookStatus,
  SubscriptionStatus,
  RefundStatus,
  InvoiceStatus,
  NotificationStatus,
  Prisma,
} from '../../generated/prisma';
import { WhatsAppStatusPayload, Msg91StatusItem } from './webhook.interfaces';

interface RazorpayPaymentEntity {
  id: string;
  order_id: string | null;
  notes?: Record<string, string | number | undefined>;
}

interface RazorpayRefundEntity {
  id: string;
  payment_id: string;
  amount: number;
}

interface RazorpaySubscriptionEntity {
  id: string;
  plan_id: string;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  notes?: Record<string, string | number | undefined>;
}

interface RazorpayWebhookEventPayload {
  payload?: {
    payment?: {
      entity: RazorpayPaymentEntity;
    };
    refund?: {
      entity: RazorpayRefundEntity;
    };
  };
}

interface RazorpayPlatformWebhookEventPayload {
  payload?: {
    subscription?: {
      entity: RazorpaySubscriptionEntity;
    };
  };
}

@Processor(QUEUE_WEBHOOKS)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
    const redisUrl = this.configService.getOrThrow<string>('REDIS_URL');
    this.redis = new Redis(redisUrl);
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'process-razorpay') {
      const { eventId, businessId } = job.data as {
        eventId: string;
        businessId: string;
      };
      await this.processRazorpayEvent(eventId, businessId);
    } else if (job.name === 'process-razorpay-platform') {
      const { eventId, businessId } = job.data as {
        eventId: string;
        businessId: string;
      };
      await this.processRazorpayPlatformEvent(eventId, businessId);
    } else if (job.name === 'process-whatsapp-status') {
      const { eventId } = job.data as { eventId: string };
      await this.processWhatsAppStatusEvent(eventId);
    } else if (job.name === 'process-msg91-status') {
      const { eventId } = job.data as { eventId: string };
      await this.processMsg91StatusEvent(eventId);
    }
  }

  private async processRazorpayEvent(eventId: string, businessId: string) {
    const webhookEvent = await this.prisma.webhookEvent.findUnique({
      where: { id: eventId },
    });

    if (!webhookEvent || webhookEvent.status !== WebhookStatus.PENDING) {
      return;
    }

    try {
      const payload =
        webhookEvent.payload as unknown as RazorpayWebhookEventPayload;
      const eventType = webhookEvent.eventType;

      if (eventType === 'payment.captured') {
        await this.handlePaymentCaptured(payload, businessId);
      } else if (eventType === 'payment.failed') {
        await this.handlePaymentFailed(payload, businessId);
      } else if (eventType === 'refund.processed') {
        await this.handleRefundProcessed(payload, businessId);
      } else {
        this.logger.warn(`Unhandled webhook event type: ${eventType}`);
      }

      // Mark event as processed
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: WebhookStatus.PROCESSED,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to process webhook event ${eventId}`,
        error instanceof Error ? error.stack : String(error),
      );

      // Mark event as failed
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: { status: WebhookStatus.FAILED },
      });

      throw error; // Let BullMQ retry
    }
  }

  private async handlePaymentCaptured(
    payload: RazorpayWebhookEventPayload,
    businessId: string,
  ) {
    const paymentEntity = payload.payload?.payment?.entity;
    if (!paymentEntity) {
      throw new Error('Invalid payment.captured payload structure');
    }

    const providerPaymentId = paymentEntity.id;
    const notes = paymentEntity.notes || {};
    const paymentId = notes.paymentId as string | undefined;

    // Resolve payment record
    let payment = await this.prisma.payment.findFirst({
      where: {
        OR: [...(paymentId ? [{ id: paymentId }] : []), { providerPaymentId }],
        businessId,
      },
    });

    if (!payment) {
      throw new Error(
        `Payment record not found for provider ID: ${providerPaymentId}`,
      );
    }

    if (payment.status === PaymentStatus.SUCCESS) {
      // Already processed
      return;
    }

    // 1. Update Payment status to SUCCESS
    payment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCESS,
        providerPaymentId,
        providerOrderId: paymentEntity.order_id || null,
      },
    });

    // 2. Generate unique sequential invoice number (e.g. INV-YYYY-0001)
    const currentYear = new Date().getFullYear();
    const count = await this.prisma.invoice.count({
      where: {
        businessId,
        invoiceNumber: {
          startsWith: `INV-${currentYear}-`,
        },
      },
    });
    const sequenceNumber = String(count + 1).padStart(4, '0');
    const invoiceNumber = `INV-${currentYear}-${sequenceNumber}`;

    // 3. Create Invoice record
    await this.prisma.invoice.create({
      data: {
        businessId,
        appointmentId: payment.appointmentId,
        invoiceNumber,
        amount: payment.amount,
        status: InvoiceStatus.PAID,
      },
    });

    // 4. Recalculate customer totalSpent
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: payment.appointmentId },
      include: { customer: true, business: true },
    });

    if (appointment) {
      await this.customersService.recalculateTotalSpent(
        businessId,
        appointment.customerId,
      );

      try {
        await this.notificationsService.send({
          businessId,
          customerId: appointment.customerId,
          templateId: 'PAYMENT_RECEIPT',
          variables: {
            customerName: appointment.customer?.name || 'Customer',
            amount: payment.amount.toString(),
            invoiceNumber,
            businessName: appointment.business.name,
          },
        });
        this.logger.log(
          `Payment receipt notification queued for invoice ${invoiceNumber}`,
        );
      } catch (notifyError) {
        this.logger.error(
          `Failed to trigger payment receipt notification for invoice ${invoiceNumber}`,
          notifyError instanceof Error
            ? notifyError.stack
            : String(notifyError),
        );
      }

      // 7-day marketing campaign attribution
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const campaignNotification = await this.prisma.notification.findFirst({
        where: {
          businessId,
          customerId: appointment.customerId,
          campaignId: { not: null },
          status: {
            in: [
              NotificationStatus.SENT,
              NotificationStatus.DELIVERED,
              NotificationStatus.READ,
            ],
          },
          createdAt: { gte: sevenDaysAgo },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (campaignNotification && campaignNotification.campaignId) {
        await this.prisma.campaign.update({
          where: { id: campaignNotification.campaignId },
          data: {
            revenueAttributed: {
              increment: payment.amount,
            },
          },
        });
        this.logger.log(
          `Attributed ${payment.amount.toString()} revenue to campaign ${campaignNotification.campaignId} for customer ${appointment.customerId}`,
        );
      }
    }

    // 5. Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: businessId, // System level hook context
        action: 'UPDATE',
        entity: 'Payment',
        entityId: payment.id,
        metadata: {
          status: PaymentStatus.SUCCESS,
          invoiceNumber,
        },
      },
    });
  }

  private async handlePaymentFailed(
    payload: RazorpayWebhookEventPayload,
    businessId: string,
  ) {
    const paymentEntity = payload.payload?.payment?.entity;
    if (!paymentEntity) {
      throw new Error('Invalid payment.failed payload structure');
    }

    const providerPaymentId = paymentEntity.id;
    const notes = paymentEntity.notes || {};
    const paymentId = notes.paymentId as string | undefined;

    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [...(paymentId ? [{ id: paymentId }] : []), { providerPaymentId }],
        businessId,
      },
    });

    if (!payment) {
      return; // Ignore if payment record doesn't exist locally
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: businessId,
        action: 'UPDATE',
        entity: 'Payment',
        entityId: payment.id,
        metadata: { status: PaymentStatus.FAILED },
      },
    });

    const appointment = await this.prisma.appointment.findFirst({
      where: { id: payment.appointmentId },
      include: { customer: true, business: true },
    });

    if (appointment && appointment.customer) {
      try {
        await this.notificationsService.send({
          businessId,
          customerId: appointment.customerId,
          templateId: 'PAYMENT_FAILURE',
          variables: {
            customerName: appointment.customer.name,
            amount: payment.amount.toString(),
            businessName: appointment.business.name,
          },
        });
        this.logger.log(
          `Payment failure notification queued for customer ${appointment.customerId}`,
        );
      } catch (notifyError) {
        this.logger.error(
          `Failed to trigger payment failure notification for customer ${appointment.customerId}`,
          notifyError instanceof Error
            ? notifyError.stack
            : String(notifyError),
        );
      }
    }
  }

  private async handleRefundProcessed(
    payload: RazorpayWebhookEventPayload,
    businessId: string,
  ) {
    const refundEntity = payload.payload?.refund?.entity;
    if (!refundEntity) {
      throw new Error('Invalid refund.processed payload structure');
    }

    const providerRefundId = refundEntity.id;
    const providerPaymentId = refundEntity.payment_id;
    const refundAmountInPaise = refundEntity.amount;
    const refundAmount = new Prisma.Decimal(refundAmountInPaise / 100);

    // Find linked successful payment record
    const payment = await this.prisma.payment.findUnique({
      where: { providerPaymentId },
    });

    if (!payment) {
      throw new Error(
        `Payment record not found for provider payment ID: ${providerPaymentId}`,
      );
    }

    // Check if Refund already processed in local DB
    let refund = await this.prisma.refund.findUnique({
      where: { providerRefundId },
    });

    if (!refund) {
      refund = await this.prisma.refund.create({
        data: {
          businessId,
          paymentId: payment.id,
          amount: refundAmount,
          status: RefundStatus.PROCESSED,
          providerRefundId,
        },
      });
    } else if (refund.status !== RefundStatus.PROCESSED) {
      refund = await this.prisma.refund.update({
        where: { id: refund.id },
        data: { status: RefundStatus.PROCESSED },
      });
    }

    // Check total refunded sum to decide if full or partial
    const refunds = await this.prisma.refund.aggregate({
      where: { paymentId: payment.id, status: RefundStatus.PROCESSED },
      _sum: { amount: true },
    });

    const totalRefunded = new Prisma.Decimal(Number(refunds._sum.amount ?? 0));
    const isFullRefund = totalRefunded.gte(
      new Prisma.Decimal(Number(payment.amount)),
    );

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: isFullRefund ? PaymentStatus.REFUNDED : payment.status,
        refundStatus: isFullRefund ? 'full' : 'partial',
      },
    });

    // Recalculate customer totalSpent
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: payment.appointmentId },
    });

    if (appointment) {
      await this.customersService.recalculateTotalSpent(
        businessId,
        appointment.customerId,
      );
    }

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: businessId,
        action: 'UPDATE',
        entity: 'Payment',
        entityId: payment.id,
        metadata: {
          status: isFullRefund ? PaymentStatus.REFUNDED : payment.status,
          refundStatus: isFullRefund ? 'full' : 'partial',
          refundId: refund.id,
        },
      },
    });
  }

  private async processRazorpayPlatformEvent(
    eventId: string,
    businessId: string,
  ) {
    const webhookEvent = await this.prisma.webhookEvent.findUnique({
      where: { id: eventId },
    });

    if (!webhookEvent || webhookEvent.status !== WebhookStatus.PENDING) {
      return;
    }

    try {
      const payload =
        webhookEvent.payload as unknown as RazorpayPlatformWebhookEventPayload;
      const eventType = webhookEvent.eventType;

      if (eventType === 'subscription.charged') {
        await this.handleSubscriptionCharged(payload, businessId);
      } else if (
        eventType === 'subscription.cancelled' ||
        eventType === 'subscription.expired'
      ) {
        await this.handleSubscriptionCancelled(payload, businessId);
      } else {
        this.logger.warn(`Unhandled platform webhook event type: ${eventType}`);
      }

      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: WebhookStatus.PROCESSED,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to process platform webhook event ${eventId}`,
        error instanceof Error ? error.stack : String(error),
      );

      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: { status: WebhookStatus.FAILED },
      });

      throw error;
    }
  }

  private async handleSubscriptionCharged(
    payload: RazorpayPlatformWebhookEventPayload,
    businessId: string,
  ) {
    const subEntity = payload.payload?.subscription?.entity;
    if (!subEntity) {
      throw new Error('Invalid subscription.charged payload structure');
    }

    const providerSubscriptionId = subEntity.id;
    const currentStartSec =
      subEntity.current_start || Math.floor(Date.now() / 1000);
    const currentEndSec =
      subEntity.current_end ||
      Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000);

    // Find local subscription record
    let subscription = await this.prisma.subscription.findUnique({
      where: { razorpaySubscriptionId: providerSubscriptionId },
    });

    const notes = subEntity.notes || {};
    const planId = (notes.planId as string | undefined) || subscription?.planId;

    if (!planId) {
      throw new Error(
        `No planId resolved for subscription: ${providerSubscriptionId}`,
      );
    }

    const plan = await this.prisma.subscriptionPlan.findUniqueOrThrow({
      where: { id: planId },
    });

    const durationDays = (currentEndSec - currentStartSec) / (24 * 60 * 60);
    const billingInterval = durationDays > 90 ? 'yearly' : 'monthly';
    const amount =
      billingInterval === 'yearly' ? plan.priceYearly : plan.priceMonthly;

    let isUpgrade = false;
    let isDowngrade = false;
    let oldPlanId: string | null = null;

    if (!subscription) {
      subscription = await this.prisma.subscription.create({
        data: {
          businessId,
          planId,
          status: SubscriptionStatus.ACTIVE,
          billingInterval,
          amount,
          currentPeriodStart: new Date(currentStartSec * 1000),
          currentPeriodEnd: new Date(currentEndSec * 1000),
          razorpaySubscriptionId: providerSubscriptionId,
        },
      });
    } else {
      oldPlanId = subscription.planId;
      if (oldPlanId !== planId) {
        const oldPlan = await this.prisma.subscriptionPlan.findUniqueOrThrow({
          where: { id: oldPlanId },
        });
        const oldPrice =
          billingInterval === 'yearly'
            ? oldPlan.priceYearly
            : oldPlan.priceMonthly;
        const newPrice = amount;
        if (Number(newPrice) > Number(oldPrice)) {
          isUpgrade = true;
        } else if (Number(newPrice) < Number(oldPrice)) {
          isDowngrade = true;
        }
      }

      subscription = await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          planId,
          status: SubscriptionStatus.ACTIVE,
          billingInterval,
          amount,
          currentPeriodStart: new Date(currentStartSec * 1000),
          currentPeriodEnd: new Date(currentEndSec * 1000),
        },
      });
    }

    // Update business plan context
    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        planId: subscription.planId,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      },
    });

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: businessId,
        action: 'UPDATE',
        entity: 'Subscription',
        entityId: subscription.id,
        metadata: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: subscription.currentPeriodEnd,
          providerSubscriptionId,
          planId,
          oldPlanId,
          transition: isUpgrade
            ? 'upgrade'
            : isDowngrade
              ? 'downgrade'
              : 'renew',
        },
      },
    });
  }

  private async handleSubscriptionCancelled(
    payload: RazorpayPlatformWebhookEventPayload,
    businessId: string,
  ) {
    const subEntity = payload.payload?.subscription?.entity;
    if (!subEntity) {
      throw new Error('Invalid subscription event payload structure');
    }

    const providerSubscriptionId = subEntity.id;

    const subscription = await this.prisma.subscription.findUnique({
      where: { razorpaySubscriptionId: providerSubscriptionId },
    });

    if (!subscription) {
      return;
    }

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.CANCELLED,
      },
    });

    const freeTrialPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { slug: 'free-trial' },
    });

    if (freeTrialPlan) {
      await this.prisma.business.update({
        where: { id: businessId },
        data: {
          planId: freeTrialPlan.id,
          subscriptionStatus: SubscriptionStatus.CANCELLED,
        },
      });
    } else {
      await this.prisma.business.update({
        where: { id: businessId },
        data: {
          subscriptionStatus: SubscriptionStatus.CANCELLED,
        },
      });
    }

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: businessId,
        action: 'UPDATE',
        entity: 'Subscription',
        entityId: subscription.id,
        metadata: {
          status: SubscriptionStatus.CANCELLED,
          providerSubscriptionId,
        },
      },
    });
  }

  private async processWhatsAppStatusEvent(eventId: string) {
    const webhookEvent = await this.prisma.webhookEvent.findUnique({
      where: { id: eventId },
    });

    if (!webhookEvent || webhookEvent.status !== WebhookStatus.PENDING) {
      return;
    }

    try {
      const payload = webhookEvent.payload as unknown as WhatsAppStatusPayload;
      const entry = payload?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const statusObj = value?.statuses?.[0];

      if (statusObj) {
        const messageId = statusObj.id;
        const status = statusObj.status; // "sent", "delivered", "read", "failed"
        const bizOpaque = statusObj.biz_opaque_callback_data;

        let notificationId: string | undefined = bizOpaque;
        if (!notificationId) {
          const cachedId = await this.redis.get(
            `whatsapp:provider:${messageId}`,
          );
          notificationId = cachedId || undefined;
        }

        if (notificationId) {
          const updates: Prisma.NotificationUpdateInput = {
            status: status as NotificationStatus,
          };
          if (status === 'sent') updates.sentAt = new Date();
          else if (status === 'delivered') updates.deliveredAt = new Date();
          else if (status === 'read') {
            updates.status = NotificationStatus.READ;
          } else if (status === 'failed') {
            updates.failedAt = new Date();
          }

          await this.prisma.notification.update({
            where: { id: notificationId },
            data: updates,
          });
        }
      }

      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: WebhookStatus.PROCESSED,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to process WhatsApp webhook status event ${eventId}`,
        error,
      );
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: { status: WebhookStatus.FAILED },
      });
      throw error;
    }
  }

  private async processMsg91StatusEvent(eventId: string) {
    const webhookEvent = await this.prisma.webhookEvent.findUnique({
      where: { id: eventId },
    });

    if (!webhookEvent || webhookEvent.status !== WebhookStatus.PENDING) {
      return;
    }

    try {
      const payload = webhookEvent.payload as unknown as
        | Msg91StatusItem[]
        | Msg91StatusItem;
      const items = Array.isArray(payload) ? payload : [payload];

      for (const item of items) {
        const requestId = item.requestId;
        const statusStr = item.status; // e.g. "Delivered", "Failed", "Success", "Sent"

        const notificationId = await this.redis.get(
          `sms:provider:${requestId}`,
        );
        if (notificationId) {
          let mappedStatus: NotificationStatus = NotificationStatus.SENT;
          const updates: Prisma.NotificationUpdateInput = {};

          if (statusStr === 'Delivered') {
            mappedStatus = NotificationStatus.DELIVERED;
            updates.deliveredAt = new Date();
          } else if (statusStr === 'Failed') {
            mappedStatus = NotificationStatus.FAILED;
            updates.failedAt = new Date();
          } else if (statusStr === 'Success' || statusStr === 'Sent') {
            mappedStatus = NotificationStatus.SENT;
            updates.sentAt = new Date();
          }

          updates.status = mappedStatus;

          await this.prisma.notification.update({
            where: { id: notificationId },
            data: updates,
          });
        }
      }

      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: WebhookStatus.PROCESSED,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to process MSG91 webhook status event ${eventId}`,
        error,
      );
      await this.prisma.webhookEvent.update({
        where: { id: eventId },
        data: { status: WebhookStatus.FAILED },
      });
      throw error;
    }
  }
}
