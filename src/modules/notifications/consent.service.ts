import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Consent, ConsentType, ConsentSource } from '../../generated/prisma';

@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async hasConsent(
    businessId: string,
    customerId: string,
    category: 'transactional' | 'marketing',
    channel: 'whatsapp' | 'sms' | 'email',
  ): Promise<boolean> {
    // 1. Transactional notifications: Allowed by default unless explicitly opted out of "data_processing"
    if (category === 'transactional') {
      const optOutRecord = await this.prisma.consent.findFirst({
        where: {
          businessId,
          customerId,
          consentType: ConsentType.DATA_PROCESSING,
          granted: false,
        },
      });

      if (optOutRecord) {
        this.logger.debug(
          `Consent denied for customer ${customerId} (transactional, channel: ${channel}) due to data_processing opt-out`,
        );
        return false;
      }
      return true;
    }

    // 2. Marketing notifications: Explicit opt-in required (granted = true)
    let consentType: ConsentType | null = null;
    if (channel === 'whatsapp') {
      consentType = ConsentType.MARKETING_WHATSAPP;
    } else if (channel === 'sms') {
      consentType = ConsentType.MARKETING_SMS;
    }

    if (!consentType) {
      return false;
    }

    const consentRecord = await this.prisma.consent.findFirst({
      where: {
        businessId,
        customerId,
        consentType,
        granted: true,
      },
    });

    if (!consentRecord) {
      this.logger.debug(
        `Consent denied for customer ${customerId} (marketing, channel: ${channel}) - no active opt-in found`,
      );
      return false;
    }

    return true;
  }

  async updateConsent(
    businessId: string,
    customerId: string,
    consentType: ConsentType,
    granted: boolean,
    source: ConsentSource = ConsentSource.MANUAL,
  ): Promise<Consent> {
    const existingConsent = await this.prisma.consent.findFirst({
      where: {
        businessId,
        customerId,
        consentType,
      },
    });

    const now = new Date();

    if (existingConsent) {
      return this.prisma.consent.update({
        where: { id: existingConsent.id },
        data: {
          granted,
          source,
          version: { increment: 1 },
          grantedAt: granted ? now : existingConsent.grantedAt,
          revokedAt: granted ? null : now,
        },
      });
    }

    return this.prisma.consent.create({
      data: {
        businessId,
        customerId,
        consentType,
        granted,
        source,
        version: 1,
        grantedAt: granted ? now : now,
        revokedAt: granted ? null : now,
      },
    });
  }
}
