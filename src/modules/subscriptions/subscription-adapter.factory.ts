import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SaasSubscriptionAdapter } from './interfaces/subscription-adapter.interface';
import { RazorpaySubscriptionAdapter } from './adapters/razorpay-subscription.adapter';

@Injectable()
export class SubscriptionAdapterFactory {
  constructor(private readonly configService: ConfigService) {}

  getAdapter(): SaasSubscriptionAdapter {
    const provider =
      this.configService.get<string>('SAAS_BILLING_PROVIDER') || 'razorpay';

    if (provider === 'razorpay') {
      const keyId = this.configService.getOrThrow<string>('RAZORPAY_KEY_ID');
      const keySecret = this.configService.getOrThrow<string>(
        'RAZORPAY_KEY_SECRET',
      );
      return new RazorpaySubscriptionAdapter(
        this.configService,
        keyId,
        keySecret,
      );
    }

    throw new BadRequestException(
      `Unsupported SaaS billing provider: ${provider}`,
    );
  }
}
