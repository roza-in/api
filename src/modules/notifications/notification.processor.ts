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
import { forwardRef, Inject } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import {
  NotificationStatus,
  NotificationChannel,
  AppointmentStatus,
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
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
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
    } else if (job.name === 'appointment-reminder-check') {
      await this.runReminderScan();
    } else if (job.name === 'staff-invite') {
      const data = job.data as {
        staffId: string;
        businessId: string;
        email: string;
        phone: string;
        token: string;
      };
      await this.processStaffInvite(data);
    }
  }

  private async processStaffInvite(data: {
    staffId: string;
    businessId: string;
    email: string;
    phone: string;
    token: string;
  }) {
    try {
      const [staff, business] = await Promise.all([
        this.prisma.staff.findFirst({
          where: { id: data.staffId, businessId: data.businessId, deletedAt: null },
        }),
        this.prisma.business.findUnique({
          where: { id: data.businessId },
        }),
      ]);

      if (!staff) {
        throw new Error(`Staff member ${data.staffId} not found`);
      }
      if (!business) {
        throw new Error(`Business ${data.businessId} not found`);
      }

      const allowedOrigins =
        this.configService.get<string>('CORS_ALLOWED_ORIGINS')?.split(',') || [];
      const frontendUrl = allowedOrigins[0] || 'http://localhost:3000';
      const inviteUrl = `${frontendUrl}/complete-invite?token=${data.token}`;

      const renderResult = this.templateService.render(
        'STAFF_INVITATION',
        {
          staffName: staff.name,
          businessName: business.name,
          inviteUrl,
        },
        'email',
      );

      if (!renderResult.email) {
        throw new Error('Email template failed to render');
      }

      await this.emailAdapter.sendEmail(
        data.email,
        renderResult.email.subject,
        renderResult.email.html,
      );

      this.logger.log(
        `Staff invitation email sent successfully to ${data.email} for business ${business.name}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process staff invitation email for ${data.email}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
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

      // 1. Mark current WhatsApp notification as failed
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

  private async runReminderScan() {
    this.logger.log('Starting upcoming appointment reminder scan...');
    const now = new Date();
    const startRange = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const endRange = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        startTime: {
          gte: startRange,
          lte: endRange,
        },
        status: {
          in: [AppointmentStatus.CONFIRMED, AppointmentStatus.RESCHEDULED],
        },
        deletedAt: null,
      },
      include: {
        customer: true,
        service: true,
        branch: true,
        business: true,
      },
    });

    this.logger.log(
      `Found ${appointments.length} appointments in 24h-25h window.`,
    );

    for (const appointment of appointments) {
      const redisKey = `appointment:reminder:sent:${appointment.id}`;
      const exists = await this.redis.get(redisKey);
      if (exists) {
        this.logger.debug(
          `Reminder already sent for appointment ${appointment.id}, skipping.`,
        );
        continue;
      }

      try {
        const timezone = appointment.branch.timezone || 'Asia/Kolkata';
        const dateStr = new Intl.DateTimeFormat('en-IN', {
          timeZone: timezone,
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
          .format(appointment.startTime)
          .replace(/\//g, '-');

        const timeStr = new Intl.DateTimeFormat('en-IN', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }).format(appointment.startTime);

        await this.redis.set(redisKey, '1', 'EX', 172800);

        await this.notificationsService.send({
          businessId: appointment.businessId,
          customerId: appointment.customerId,
          templateId: 'APPOINTMENT_REMINDER',
          variables: {
            customerName: appointment.customer.name,
            date: dateStr,
            time: timeStr,
            serviceName: appointment.service.name,
            branchAddress: appointment.branch.address,
            businessName: appointment.business.name,
          },
        });

        this.logger.log(
          `Reminder queued successfully for appointment ${appointment.id}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to process reminder for appointment ${appointment.id}`,
          error instanceof Error ? error.stack : String(error),
        );
        await this.redis.del(redisKey);
      }
    }
  }
}
