import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SubscriptionFeatures {
  bookingWebsite?: boolean;
  whatsappReminders?: boolean;
  analytics?: boolean;
  customDomain?: boolean;
  marketing?: boolean;
  prioritySupport?: boolean;
  apiAccess?: boolean;
}

@Injectable()
export class EntitlementsService {
  private readonly logger = new Logger(EntitlementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the subscription plan for a business.
   */
  async getPlanForBusiness(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException(`Business with ID ${businessId} not found`);
    }

    const activeSub = await this.prisma.subscription.findFirst({
      where: {
        businessId,
        status: { in: ['ACTIVE', 'TRIALING'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeSub) {
      throw new ForbiddenException(
        'No active subscription found for this business. Please upgrade.',
      );
    }

    const now = new Date();

    if (activeSub.status === 'TRIALING' && activeSub.currentPeriodEnd < now) {
      throw new ForbiddenException(
        'Your free trial has expired. Please upgrade to a paid plan.',
      );
    }

    if (activeSub.status === 'ACTIVE' && activeSub.currentPeriodEnd < now) {
      throw new ForbiddenException(
        'Your subscription has expired. Please renew your plan.',
      );
    }

    return activeSub.plan;
  }

  /**
   * Verifies if a business has access to a specific boolean feature flag.
   */
  async hasFeature(
    businessId: string,
    featureName: keyof SubscriptionFeatures,
  ): Promise<boolean> {
    try {
      const plan = await this.getPlanForBusiness(businessId);
      const features = (plan.features || {}) as SubscriptionFeatures;
      return !!features[featureName];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.stack : String(error);
      this.logger.error(
        `Error checking feature ${featureName} for business ${businessId}`,
        errorMessage,
      );
      return false;
    }
  }

  /**
   * Asserts that the business has not reached the branch limit.
   */
  async assertBranchLimit(businessId: string): Promise<void> {
    const plan = await this.getPlanForBusiness(businessId);
    const count = await this.prisma.branch.count({
      where: { businessId, deletedAt: null },
    });

    if (count >= plan.maxBranches) {
      throw new ForbiddenException(
        `Branch limit reached (${plan.maxBranches}). Please upgrade your plan.`,
      );
    }
  }

  /**
   * Asserts that the business has not reached the staff limit.
   */
  async assertStaffLimit(businessId: string): Promise<void> {
    const plan = await this.getPlanForBusiness(businessId);
    const count = await this.prisma.staff.count({
      where: { businessId, deletedAt: null },
    });

    if (count >= plan.maxStaff) {
      throw new ForbiddenException(
        `Staff limit reached (${plan.maxStaff}). Please upgrade your plan.`,
      );
    }
  }

  /**
   * Asserts that the business has not exceeded the appointment limit in their current billing period.
   */
  async assertAppointmentLimit(businessId: string): Promise<void> {
    const plan = await this.getPlanForBusiness(businessId);

    // Get current period start and end from active subscription
    const activeSub = await this.prisma.subscription.findFirst({
      where: { businessId, status: { in: ['ACTIVE', 'TRIALING'] } },
      orderBy: { createdAt: 'desc' },
    });

    // Fallback to start of the current month if no subscription dates are present
    const now = new Date();
    const periodStart =
      activeSub?.currentPeriodStart ??
      new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = activeSub?.currentPeriodEnd ?? now;

    const count = await this.prisma.appointment.count({
      where: {
        businessId,
        createdAt: {
          gte: periodStart,
          lte: periodEnd,
        },
        deletedAt: null,
      },
    });

    if (count >= plan.maxAppointments) {
      throw new ForbiddenException(
        `Appointment limit reached for this billing period (${plan.maxAppointments}). Please upgrade your plan.`,
      );
    }
  }
}
