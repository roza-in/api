import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhookProcessor } from './webhook.processor';
import { PaymentsModule } from '../payments/payments.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [PaymentsModule, CustomersModule],
  controllers: [WebhooksController],
  providers: [WebhookProcessor],
})
export class WebhooksModule {}
