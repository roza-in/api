import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentService } from '../notifications/consent.service';
import { StorageService } from '../storage/storage.service';
import { v4 as uuidv4 } from 'uuid';
import {
  SubscriptionStatus,
  ConsentType,
  ConsentSource,
} from '../../generated/prisma';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consentService: ConsentService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Retrieve all active consents for a customer.
   */
  async getConsents(businessId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    return this.prisma.consent.findMany({
      where: { businessId, customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create or update consent values for a customer.
   */
  async updateConsent(
    businessId: string,
    customerId: string,
    consentType: ConsentType,
    granted: boolean,
    source: ConsentSource = ConsentSource.MANUAL,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    const consent = await this.consentService.updateConsent(
      businessId,
      customerId,
      consentType,
      granted,
      source,
    );

    // Create audit log for consent change
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: customer.id, // acting as customer or updatedBy
        action: 'UPDATE',
        entity: 'Consent',
        entityId: consent.id,
        metadata: {
          consentType,
          granted,
          source,
          updatedAt: new Date().toISOString(),
        },
      },
    });

    return consent;
  }

  /**
   * Generate customer personal data export (JSON), upload to S3, and return S3 CDN URL.
   */
  async exportCustomerData(
    businessId: string,
    customerId: string,
    userId: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId, deletedAt: null },
      include: {
        consents: true,
        appointments: {
          where: { deletedAt: null },
          include: {
            service: true,
            payments: {
              include: { refunds: true },
            },
          },
        },
        notifications: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      businessId,
      customerProfile: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        gender: customer.gender,
        birthday: customer.birthday,
        notes: customer.notes,
        totalSpent: Number(customer.totalSpent) / 100, // convert paise to INR
        createdAt: customer.createdAt,
      },
      consents: customer.consents.map((c) => ({
        consentType: c.consentType,
        granted: c.granted,
        source: c.source,
        grantedAt: c.grantedAt,
        revokedAt: c.revokedAt,
      })),
      appointments: customer.appointments.map((a) => ({
        id: a.id,
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status,
        service: a.service.name,
        price: Number(a.service.price) / 100,
        notes: a.notes,
        payments: a.payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount) / 100,
          status: p.status,
          providerPaymentId: p.providerPaymentId,
          refunds: p.refunds.map((r) => ({
            id: r.id,
            amount: Number(r.amount) / 100,
            status: r.status,
          })),
        })),
      })),
      notifications: customer.notifications.map((n) => ({
        channel: n.channel,
        status: n.status,
        provider: n.provider,
        sentAt: n.sentAt,
      })),
    };

    const buffer = Buffer.from(JSON.stringify(exportData, null, 2), 'utf-8');
    const originalname = `customer_data_export_${customerId}_${Date.now()}.json`;

    const fileUrl = await this.storageService.uploadFile(
      businessId,
      {
        buffer,
        originalname,
        mimetype: 'application/json',
        size: buffer.length,
      },
      'exports',
    );

    // Create Audit Log
    const reportId = uuidv4();
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId,
        action: 'EXPORT',
        entity: 'CustomerData',
        entityId: reportId,
        metadata: {
          customerId,
          fileUrl,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    return { fileUrl };
  }

  /**
   * Request data deletion (Right to be Forgotten).
   * Enforces 30-day processing window by default.
   */
  async requestDeletion(businessId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    const existingRequest = await this.prisma.dataDeletionRequest.findFirst({
      where: { businessId, customerId, status: 'PENDING' },
    });
    if (existingRequest) {
      throw new ConflictException(
        'A data deletion request is already pending for this customer',
      );
    }

    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 30); // 30-day window

    return this.prisma.dataDeletionRequest.create({
      data: {
        businessId,
        customerId,
        status: 'PENDING',
        scheduledAt,
      },
    });
  }

  /**
   * Cancel a pending deletion request.
   */
  async cancelDeletionRequest(businessId: string, requestId: string) {
    const request = await this.prisma.dataDeletionRequest.findFirst({
      where: { id: requestId, businessId },
    });
    if (!request) {
      throw new NotFoundException('Deletion request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot cancel deletion request in ${request.status} status`,
      );
    }

    return this.prisma.dataDeletionRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * Immediately execute anonymization for a deletion request (bypass 30-day wait).
   */
  async executeDeletionRequest(
    businessId: string,
    requestId: string,
    userId: string,
  ) {
    const request = await this.prisma.dataDeletionRequest.findFirst({
      where: { id: requestId, businessId },
    });
    if (!request) {
      throw new NotFoundException('Deletion request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot execute deletion request in ${request.status} status`,
      );
    }

    await this.anonymizeCustomerData(businessId, request.customerId, userId);

    return this.prisma.dataDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });
  }

  /**
   * Actual anonymization logic for a customer.
   */
  private async anonymizeCustomerData(
    businessId: string,
    customerId: string,
    userId: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Anonymize Customer profile details
      await tx.customer.update({
        where: { id: customerId },
        data: {
          name: 'Anonymized Customer',
          phone: `anonymized-${customerId.substring(0, 8)}`,
          email: null,
          gender: null,
          birthday: null,
          notes: null,
          deletedAt: new Date(),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });

      // 2. Revoke all consents
      await tx.consent.updateMany({
        where: { businessId, customerId },
        data: {
          granted: false,
          revokedAt: new Date(),
        },
      });

      // 3. Clear appointment notes
      await tx.appointment.updateMany({
        where: { businessId, customerId },
        data: { notes: null },
      });
    });

    this.logger.log(
      `Anonymized customer ${customerId} for business ${businessId}`,
    );
  }

  /**
   * Execute scheduled deletions that reached their 30-day window.
   */
  async executeScheduledDeletions() {
    const now = new Date();
    const pendingDeletions = await this.prisma.dataDeletionRequest.findMany({
      where: {
        status: 'PENDING',
        scheduledAt: { lte: now },
      },
    });

    this.logger.log(
      `Found ${pendingDeletions.length} pending scheduled deletions to execute`,
    );

    let count = 0;
    for (const request of pendingDeletions) {
      try {
        await this.anonymizeCustomerData(
          request.businessId,
          request.customerId,
          'system-compliance-worker',
        );

        await this.prisma.dataDeletionRequest.update({
          where: { id: request.id },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
          },
        });
        count++;
      } catch (err) {
        this.logger.error(
          `Failed to process scheduled deletion request ${request.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    return { processed: count };
  }

  /**
   * Purge business data for cancelled subscriptions (>12 months ago) preserving financial data.
   */
  async runRetentionCleanup() {
    const oneYearAgo = new Date();
    oneYearAgo.setMonth(oneYearAgo.getMonth() - 12);

    // Query businesses where subscription status was cancelled more than 12 months ago
    // Wait, subscription status check: we look at subscription table
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.CANCELLED,
        updatedAt: { lte: oneYearAgo },
      },
      select: { businessId: true },
    });

    const businessIds = subscriptions.map((s) => s.businessId);

    this.logger.log(
      `Found ${businessIds.length} businesses cancelled for > 12 months for retention cleanup`,
    );

    let count = 0;
    for (const businessId of businessIds) {
      try {
        await this.cleanupBusinessData(businessId);
        count++;
      } catch (err) {
        this.logger.error(
          `Failed to cleanup retention data for business ${businessId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    return { cleanedUp: count };
  }

  /**
   * Preserves financial/audit logs, purges everything else, anonymizes business name & PII.
   */
  private async cleanupBusinessData(businessId: string) {
    this.logger.log(
      `Running data retention cleanup for business ${businessId}`,
    );

    await this.prisma.$transaction(async (tx) => {
      // 1. Delete consents & deletion requests
      await tx.consent.deleteMany({ where: { businessId } });
      await tx.dataDeletionRequest.deleteMany({ where: { businessId } });

      // 2. Delete non-financial customer records that don't have appointments/payments
      // To ensure no foreign keys crash, let's anonymize ALL customers of this business
      await tx.customer.updateMany({
        where: { businessId },
        data: {
          name: 'Anonymized Customer',
          phone: 'anonymized-retention',
          email: null,
          gender: null,
          birthday: null,
          notes: null,
          deletedAt: new Date(),
        },
      });

      // 3. Clear appointment notes (keep row for payment references)
      await tx.appointment.updateMany({
        where: { businessId },
        data: { notes: null },
      });

      // 4. Hard delete leaves, reviews, campaigns, packages, memberships, inventories, media assets
      await tx.leave.deleteMany({ where: { businessId } });
      await tx.review.deleteMany({ where: { businessId } });
      await tx.campaign.deleteMany({ where: { businessId } });
      await tx.package.deleteMany({ where: { businessId } });
      await tx.membership.deleteMany({ where: { businessId } });
      await tx.inventory.deleteMany({ where: { businessId } });
      await tx.mediaAsset.deleteMany({ where: { businessId } });

      // 5. Delete staff-services and staff
      await tx.staffService.deleteMany({
        where: { staff: { businessId } },
      });
      await tx.staff.deleteMany({ where: { businessId } });

      // 6. Delete pages, domains, websites
      await tx.domain.deleteMany({
        where: { website: { businessId } },
      });
      await tx.page.deleteMany({
        where: { website: { businessId } },
      });
      await tx.websiteVersion.deleteMany({
        where: { website: { businessId } },
      });
      await tx.website.deleteMany({ where: { businessId } });
      await tx.theme.deleteMany({ where: { businessId } });

      // 7. Delete services and categories
      await tx.service.deleteMany({ where: { businessId } });
      await tx.serviceCategory.deleteMany({ where: { businessId } });

      // 8. Delete branches
      await tx.branch.deleteMany({ where: { businessId } });

      // 9. Anonymize Business itself
      await tx.business.update({
        where: { id: businessId },
        data: {
          name: 'Archived Business',
          slug: `archived-slug-${businessId.substring(0, 8)}`,
          phone: null,
          email: null,
          description: null,
          logoUrl: null,
          status: 'SUSPENDED',
          deletedAt: new Date(),
        },
      });
    });

    this.logger.log(
      `Retention cleanup completed successfully for business ${businessId}`,
    );
  }
}
