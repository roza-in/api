import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionAdapterFactory } from './subscription-adapter.factory';
import { CheckoutSubscriptionDto } from './dto/checkout-subscription.dto';
import { SubscriptionStatus } from '../../generated/prisma';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterFactory: SubscriptionAdapterFactory,
  ) {}

  async getPlans() {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: { priceMonthly: 'asc' },
    });
  }

  async getActiveSubscription(businessId: string) {
    const activeSub = await this.prisma.subscription.findFirst({
      where: {
        businessId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeSub) {
      throw new NotFoundException(
        'No active subscription found for this business',
      );
    }

    const now = new Date();
    const trialExpired =
      activeSub.status === 'TRIALING' && activeSub.currentPeriodEnd < now;
    const subExpired =
      activeSub.status === 'ACTIVE' && activeSub.currentPeriodEnd < now;

    return {
      id: activeSub.id,
      plan: {
        id: activeSub.plan.id,
        name: activeSub.plan.name,
        slug: activeSub.plan.slug,
        maxBranches: activeSub.plan.maxBranches,
        maxStaff: activeSub.plan.maxStaff,
        maxAppointments: activeSub.plan.maxAppointments,
        features: activeSub.plan.features,
      },
      status: activeSub.status,
      currentPeriodStart: activeSub.currentPeriodStart,
      currentPeriodEnd: activeSub.currentPeriodEnd,
      cancelAtPeriodEnd: activeSub.cancelAtPeriodEnd,
      razorpaySubscriptionId: activeSub.razorpaySubscriptionId,
      isExpired: trialExpired || subExpired,
    };
  }

  async checkout(
    businessId: string,
    userId: string,
    dto: CheckoutSubscriptionDto,
  ) {
    // 1. Resolve targeted plan
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { slug: dto.planSlug },
    });

    if (!plan) {
      throw new NotFoundException(
        `Subscription plan '${dto.planSlug}' not found`,
      );
    }

    // 2. Limit validations: Ensure business doesn't exceed branch or staff limits of the new plan
    const activeBranchesCount = await this.prisma.branch.count({
      where: { businessId, deletedAt: null },
    });

    if (activeBranchesCount > plan.maxBranches) {
      throw new BadRequestException(
        `Cannot checkout. The target plan allows up to ${plan.maxBranches} branches, but your business currently has ${activeBranchesCount} active branches. Please delete extra branches first.`,
      );
    }

    const activeStaffCount = await this.prisma.staff.count({
      where: { businessId, deletedAt: null },
    });

    if (activeStaffCount > plan.maxStaff) {
      throw new BadRequestException(
        `Cannot checkout. The target plan allows up to ${plan.maxStaff} staff members, but your business currently has ${activeStaffCount} active staff members. Please remove extra staff first.`,
      );
    }

    // 3. Resolve customer/owner details
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: {
        members: {
          where: { role: { name: 'OWNER' } },
          include: { user: true },
        },
      },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const owner = business.members[0]?.user;
    const customerName =
      business.name || owner?.email.split('@')[0] || 'Business Owner';
    const customerEmail = business.email || owner?.email || 'billing@rozx.in';
    const customerPhone = business.phone || '+919999999999';

    // 4. Invoke gateway adapter
    const adapter = this.adapterFactory.getAdapter();

    try {
      const checkoutResult = await adapter.createSubscription({
        planSlug: dto.planSlug,
        billingCycle: dto.billingCycle,
        customerName,
        customerEmail,
        customerPhone,
        notes: {
          businessId,
          userId,
          planId: plan.id,
          billingCycle: dto.billingCycle,
        },
      });

      // Update or create a pending subscription record locally
      const subscription = await this.prisma.subscription.upsert({
        where: {
          razorpaySubscriptionId: checkoutResult.providerSubscriptionId,
        },
        update: {
          planId: plan.id,
          status: SubscriptionStatus.PAST_DUE, // Pending payment confirmation
        },
        create: {
          businessId,
          planId: plan.id,
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(
            Date.now() +
              (dto.billingCycle === 'monthly'
                ? 30 * 24 * 60 * 60 * 1000
                : 365 * 24 * 60 * 60 * 1000),
          ),
          razorpaySubscriptionId: checkoutResult.providerSubscriptionId,
        },
      });

      // Log audit trail
      await this.prisma.auditLog.create({
        data: {
          businessId,
          userId,
          action: 'CREATE',
          entity: 'Subscription',
          entityId: subscription.id,
          metadata: {
            planSlug: dto.planSlug,
            billingCycle: dto.billingCycle,
            providerSubscriptionId: checkoutResult.providerSubscriptionId,
          },
        },
      });

      return checkoutResult;
    } catch (error) {
      this.logger.error(
        `Failed to create subscription checkout for business ${businessId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadRequestException(
        `Subscription initialization failed: ${
          error instanceof Error ? error.message : 'Unknown gateway error'
        }`,
      );
    }
  }

  async cancel(businessId: string, userId: string) {
    const activeSub = await this.prisma.subscription.findFirst({
      where: {
        businessId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeSub) {
      throw new NotFoundException('No active subscription found to cancel');
    }

    if (activeSub.cancelAtPeriodEnd) {
      throw new BadRequestException('Subscription is already set to cancel');
    }

    if (activeSub.razorpaySubscriptionId) {
      const adapter = this.adapterFactory.getAdapter();
      try {
        // Cancel subscription at period end on Razorpay (grace period)
        await adapter.cancelSubscription(
          activeSub.razorpaySubscriptionId,
          true,
        );
      } catch (error) {
        this.logger.error(
          `Failed to cancel subscription ${activeSub.razorpaySubscriptionId} on gateway`,
          error instanceof Error ? error.stack : String(error),
        );
        throw new BadRequestException(
          `Failed to cancel gateway subscription: ${
            error instanceof Error ? error.message : 'Unknown gateway error'
          }`,
        );
      }
    }

    // Update locally to flag cancel at period end
    const updated = await this.prisma.subscription.update({
      where: { id: activeSub.id },
      data: { cancelAtPeriodEnd: true },
    });

    // Log audit trail
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId,
        action: 'UPDATE',
        entity: 'Subscription',
        entityId: activeSub.id,
        metadata: {
          cancelAtPeriodEnd: true,
          status: activeSub.status,
        },
      },
    });

    return updated;
  }
}
