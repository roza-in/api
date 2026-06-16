import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { TemplateService } from './template.service';
import { ConsentService } from './consent.service';
import { NotificationProcessor } from './notification.processor';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
import { SmsAdapter } from './adapters/sms.adapter';
import { EmailAdapter } from './adapters/email.adapter';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    TemplateService,
    ConsentService,
    NotificationProcessor,
    WhatsAppAdapter,
    SmsAdapter,
    EmailAdapter,
  ],
  exports: [
    NotificationsService,
    TemplateService,
    ConsentService,
    WhatsAppAdapter,
    SmsAdapter,
    EmailAdapter,
  ],
})
export class NotificationsModule {}
