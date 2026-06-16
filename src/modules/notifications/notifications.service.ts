import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentService } from './consent.service';
import { TemplateService } from './template.service';
import { QUEUE_NOTIFICATIONS } from '../queue/queue.constants';
import {
  Notification,
  NotificationChannel,
  NotificationStatus,
} from '../../generated/prisma';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly consentService: ConsentService,
    private readonly templateService: TemplateService,
    @InjectQueue(QUEUE_NOTIFICATIONS)
    private readonly notificationQueue: Queue,
  ) {
    const redisUrl = this.configService.getOrThrow<string>('REDIS_URL');
    this.redis = new Redis(redisUrl);
  }

  async send(params: {
    businessId: string;
    customerId: string;
    templateId: string;
    variables: Record<string, string>;
    preferredChannel?: 'whatsapp' | 'sms' | 'email';
    campaignId?: string;
  }): Promise<Notification> {
    const {
      businessId,
      customerId,
      templateId,
      variables,
      preferredChannel,
      campaignId,
    } = params;

    // 1. Determine notification category (marketing vs transactional)
    const category = this.getCategoryForTemplate(templateId);

    // 2. Select channel based on preference, support, and fallbacks
    let channel: 'whatsapp' | 'sms' | 'email' = 'whatsapp';

    if (preferredChannel) {
      channel = preferredChannel;
    } else {
      channel = this.determineDefaultChannel(templateId);
    }

    // 3. Enforce Redis 24h Rate Limiting
    const rateLimitKey = `ratelimit:notify:${businessId}:${customerId}:${category}`;
    const limit = category === 'transactional' ? 5 : 2;
    const count = await this.redis.incr(rateLimitKey);

    if (count === 1) {
      await this.redis.expire(rateLimitKey, 86400); // 24 hours
    }

    if (count > limit) {
      this.logger.warn(
        `Rate limit exceeded for customer ${customerId} under category ${category}. Current count: ${count}`,
      );
      throw new BadRequestException(
        `Daily notification rate limit exceeded for ${category} messages.`,
      );
    }

    // 4. Validate Consent
    let hasConsent = await this.consentService.hasConsent(
      businessId,
      customerId,
      category,
      channel,
    );

    // If no consent for WhatsApp transactional, fall back to SMS automatically
    if (!hasConsent && channel === 'whatsapp' && category === 'transactional') {
      this.logger.log(
        `No WhatsApp consent for customer ${customerId}. Falling back to SMS.`,
      );
      channel = 'sms';
      hasConsent = await this.consentService.hasConsent(
        businessId,
        customerId,
        category,
        channel,
      );
    }

    if (!hasConsent) {
      throw new BadRequestException(
        `Customer has not granted consent for ${channel} under ${category} category.`,
      );
    }

    // 5. Create pending notification record in the database
    const provider = this.getProviderForChannel(channel);
    const dbChannel = channel.toUpperCase() as NotificationChannel;
    const notification = await this.prisma.notification.create({
      data: {
        businessId,
        customerId,
        campaignId,
        channel: dbChannel,
        templateId,
        status: NotificationStatus.PENDING,
        provider,
      },
    });

    // 6. Queue BullMQ job for async dispatch
    await this.notificationQueue.add(
      'send-notification',
      {
        notificationId: notification.id,
        variables,
      },
      {
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    );

    return notification;
  }

  private getCategoryForTemplate(
    templateId: string,
  ): 'transactional' | 'marketing' {
    // Current application templates are all transactional (reminders, alerts, confirmations)
    // Future campaigns would be classified as marketing.
    const marketingTemplates = ['PROMO_CAMPAIGN', 'MARKETING_OFFER'];
    return marketingTemplates.includes(templateId)
      ? 'marketing'
      : 'transactional';
  }

  private determineDefaultChannel(
    templateId: string,
  ): 'whatsapp' | 'sms' | 'email' {
    // Select channel based on template configuration support
    const emailOnlyTemplates = [
      'TRIAL_REMINDER',
      'SUBSCRIPTION_RENEWAL',
      'SECURITY_ALERT',
    ];
    if (emailOnlyTemplates.includes(templateId)) {
      return 'email';
    }
    // Default to WhatsApp for customer notifications (confirmations, receipts, etc.)
    return 'whatsapp';
  }

  private getProviderForChannel(channel: 'whatsapp' | 'sms' | 'email'): string {
    switch (channel) {
      case 'whatsapp':
        return 'meta';
      case 'sms':
        return 'msg91';
      case 'email':
        return 'ses';
    }
  }
}
