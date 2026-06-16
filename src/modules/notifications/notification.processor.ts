import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
import { SmsAdapter } from './adapters/sms.adapter';
import { EmailAdapter } from './adapters/email.adapter';
import { TemplateService } from './template.service';
import { QUEUE_NOTIFICATIONS } from '../queue/queue.constants';
import {
  NotificationStatus,
  NotificationChannel,
} from '../../generated/prisma';

@Processor(QUEUE_NOTIFICATIONS)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly whatsappAdapter: WhatsAppAdapter,
    private readonly smsAdapter: SmsAdapter,
    private readonly emailAdapter: EmailAdapter,
    private readonly templateService: TemplateService,
  ) {
    super();
    const redisUrl = this.configService.getOrThrow<string>('REDIS_URL');
    this.redis = new Redis(redisUrl);
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'send-notification') {
      const { notificationId, variables } = job.data as {
        notificationId: string;
        variables: Record<string, string>;
      };
      await this.processNotification(notificationId, variables);
    }
  }

  private async processNotification(
    notificationId: string,
    variables: Record<string, string>,
  ) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { customer: true },
    });

    if (!notification || notification.status !== NotificationStatus.PENDING) {
      return;
    }

    const { channel, templateId, customer } = notification;

    if (!templateId) {
      throw new Error(
        `Notification ${notificationId} does not have a templateId`,
      );
    }

    try {
      if (channel === NotificationChannel.WHATSAPP) {
        await this.dispatchWhatsApp(
          notificationId,
          customer.phone,
          templateId,
          variables,
        );
      } else if (channel === NotificationChannel.SMS) {
        await this.dispatchSms(
          notificationId,
          customer.phone,
          templateId,
          variables,
        );
      } else if (channel === NotificationChannel.EMAIL) {
        if (!customer.email) {
          throw new Error(
            `Customer ${customer.id} does not have an email address`,
          );
        }
        await this.dispatchEmail(
          notificationId,
          customer.email,
          templateId,
          variables,
        );
      } else {
        throw new Error(`Unsupported channel: ${channel}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed processing notification ${notificationId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error; // Propagate error for BullMQ to retry if desired (or handled by fallback)
    }
  }

  private async dispatchWhatsApp(
    notificationId: string,
    phone: string,
    templateId: string,
    variables: Record<string, string>,
  ) {
    const renderResult = this.templateService.render(
      templateId,
      variables,
      'whatsapp',
    );
    if (!renderResult.whatsapp) {
      throw new Error(
        `WhatsApp payload could not be rendered for template ${templateId}`,
      );
    }

    try {
      const providerMessageId = await this.whatsappAdapter.sendTemplate(
        phone,
        renderResult.whatsapp.templateName,
        renderResult.whatsapp.language,
        renderResult.whatsapp.parameters,
      );

      // Meta callback updates status asynchronously via webhooks using messageId (passed as biz_opaque_callback_data).
      // Since WhatsApp uses biz_opaque_callback_data, we pass the notification ID.
      // But we can also cache the mapping from Meta providerMessageId to internal notificationId.
      await this.redis.set(
        `whatsapp:provider:${providerMessageId}`,
        notificationId,
        'EX',
        604800,
      ); // 7 days

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `WhatsApp API delivery initialization failure for notification ${notificationId}: ${errMsg}`,
      );

      // Enforce transactional fallback to SMS immediately
      const isTransactional = this.isTransactionalTemplate(templateId);

      // 1. Mark current WhatsApp notification as failed
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.FAILED,
          failedAt: new Date(),
        },
      });

      if (isTransactional) {
        this.logger.log(
          `Initiating synchronous SMS fallback for transactional notification ${notificationId}`,
        );
        await this.triggerSmsFallback(
          notificationId,
          phone,
          templateId,
          variables,
        );
      } else {
        throw error; // Re-throw to fail the BullMQ job for non-transactional messages
      }
    }
  }

  private async triggerSmsFallback(
    originalNotificationId: string,
    phone: string,
    templateId: string,
    variables: Record<string, string>,
  ) {
    // 1. Retrieve the original notification to copy properties
    const origNotification = await this.prisma.notification.findUnique({
      where: { id: originalNotificationId },
    });

    if (!origNotification) {
      return;
    }

    // 2. Create a new fallback notification log for SMS in the database
    const fallbackNotification = await this.prisma.notification.create({
      data: {
        businessId: origNotification.businessId,
        customerId: origNotification.customerId,
        channel: NotificationChannel.SMS,
        templateId,
        status: NotificationStatus.PENDING,
        provider: 'msg91',
      },
    });

    try {
      const renderResult = this.templateService.render(
        templateId,
        variables,
        'sms',
      );
      if (!renderResult.sms) {
        throw new Error(
          `SMS payload could not be rendered for fallback template ${templateId}`,
        );
      }

      const requestId = await this.smsAdapter.sendSms(
        phone,
        renderResult.sms.templateId,
        renderResult.sms.variables,
      );

      // Cache request ID to local Notification mapping
      await this.redis.set(
        `sms:provider:${requestId}`,
        fallbackNotification.id,
        'EX',
        604800,
      );

      await this.prisma.notification.update({
        where: { id: fallbackNotification.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        },
      });
    } catch (smsError) {
      const smsErrMsg =
        smsError instanceof Error ? smsError.message : String(smsError);
      this.logger.error(
        `Synchronous SMS fallback failed for customer phone ${phone}: ${smsErrMsg}`,
      );

      await this.prisma.notification.update({
        where: { id: fallbackNotification.id },
        data: {
          status: NotificationStatus.FAILED,
          failedAt: new Date(),
        },
      });
    }
  }

  private async dispatchSms(
    notificationId: string,
    phone: string,
    templateId: string,
    variables: Record<string, string>,
  ) {
    const renderResult = this.templateService.render(
      templateId,
      variables,
      'sms',
    );
    if (!renderResult.sms) {
      throw new Error(
        `SMS payload could not be rendered for template ${templateId}`,
      );
    }

    try {
      const requestId = await this.smsAdapter.sendSms(
        phone,
        renderResult.sms.templateId,
        renderResult.sms.variables,
      );

      // Cache request ID mapping
      await this.redis.set(
        `sms:provider:${requestId}`,
        notificationId,
        'EX',
        604800,
      ); // 7 days

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.FAILED,
          failedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async dispatchEmail(
    notificationId: string,
    email: string,
    templateId: string,
    variables: Record<string, string>,
  ) {
    const renderResult = this.templateService.render(
      templateId,
      variables,
      'email',
    );
    if (!renderResult.email) {
      throw new Error(
        `Email payload could not be rendered for template ${templateId}`,
      );
    }

    try {
      await this.emailAdapter.sendEmail(
        email,
        renderResult.email.subject,
        renderResult.email.html,
      );

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.FAILED,
          failedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private isTransactionalTemplate(templateId: string): boolean {
    const marketingTemplates = ['PROMO_CAMPAIGN', 'MARKETING_OFFER'];
    return !marketingTemplates.includes(templateId);
  }
}
