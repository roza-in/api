import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../../common/utils/encryption.service';
import { PaymentAdapter } from './interfaces/payment-adapter.interface';
import { RazorpayAdapter } from './adapters/razorpay.adapter';

@Injectable()
export class PaymentAdapterFactory {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getAdapter(
    businessId: string,
    provider = 'razorpay',
  ): Promise<PaymentAdapter> {
    const paymentConfig = await this.prisma.paymentConfig.findUnique({
      where: {
        businessId_provider: {
          businessId,
          provider,
        },
      },
    });

    if (!paymentConfig || !paymentConfig.isActive) {
      throw new BadRequestException(
        `Payment provider '${provider}' is not configured or inactive for this business.`,
      );
    }

    const rawConfig = paymentConfig.config as Record<string, string>;
    const keyId = rawConfig.keyId;
    let keySecret = '';

    if (!keyId || !rawConfig.keySecret) {
      throw new BadRequestException('Malformed payment configuration.');
    }

    try {
      keySecret = this.encryptionService.decrypt(rawConfig.keySecret);
    } catch {
      throw new BadRequestException(
        'Failed to decrypt payment configuration credentials.',
      );
    }

    if (provider === 'razorpay') {
      return new RazorpayAdapter(keyId, keySecret);
    }

    throw new BadRequestException(`Unsupported payment provider: ${provider}`);
  }

  async getWebhookSecret(
    businessId: string,
    provider = 'razorpay',
  ): Promise<string> {
    const paymentConfig = await this.prisma.paymentConfig.findUnique({
      where: {
        businessId_provider: {
          businessId,
          provider,
        },
      },
    });

    if (!paymentConfig || !paymentConfig.isActive) {
      throw new BadRequestException(
        `Payment provider '${provider}' is not configured or inactive.`,
      );
    }

    const rawConfig = paymentConfig.config as Record<string, string>;
    if (!rawConfig.webhookSecret) {
      throw new BadRequestException('Webhook secret is not configured.');
    }

    try {
      return this.encryptionService.decrypt(rawConfig.webhookSecret);
    } catch {
      throw new BadRequestException('Failed to decrypt webhook secret.');
    }
  }
}
