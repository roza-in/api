/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionAdapterFactory } from './subscription-adapter.factory';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SubscriptionStatus } from '../../generated/prisma';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: PrismaService;

  const mockAdapter = {
    createSubscription: jest.fn(),
    cancelSubscription: jest.fn(),
    updateSubscription: jest.fn(),
  };

  const mockAdapterFactory = {
    getAdapter: jest.fn(() => mockAdapter),
  };

  const mockPrismaService = {
    subscriptionPlan: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    branch: {
      count: jest.fn(),
    },
    staff: {
      count: jest.fn(),
    },
    business: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SubscriptionAdapterFactory, useValue: mockAdapterFactory },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('getPlans', () => {
    it('should list all subscription plans ordered by price', async () => {
      const plans = [
        { id: 'plan-1', priceMonthly: 100 },
        { id: 'plan-2', priceMonthly: 200 },
      ];
      mockPrismaService.subscriptionPlan.findMany.mockResolvedValue(plans);

      const result = await service.getPlans();

      expect(result).toEqual(plans);
      expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith({
        orderBy: { priceMonthly: 'asc' },
      });
    });
  });

  describe('getActiveSubscription', () => {
    const businessId = 'business-uuid';

    it('should throw NotFoundException if no active subscription exists', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);

      await expect(service.getActiveSubscription(businessId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return subscription details and isExpired=false if not expired', async () => {
      const mockSubPlan = {
        id: 'plan-uuid',
        name: 'Growth',
        slug: 'growth',
        maxBranches: 5,
        maxStaff: 10,
        maxAppointments: 1000,
        features: {},
      };
      const mockSub = {
        id: 'sub-uuid',
        planId: 'plan-uuid',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000000),
        cancelAtPeriodEnd: false,
        razorpaySubscriptionId: 'sub_rzp_123',
        plan: mockSubPlan,
      };

      mockPrismaService.subscription.findFirst.mockResolvedValue(mockSub);

      const result = await service.getActiveSubscription(businessId);

      expect(result).toEqual({
        id: 'sub-uuid',
        plan: {
          id: 'plan-uuid',
          name: 'Growth',
          slug: 'growth',
          maxBranches: 5,
          maxStaff: 10,
          maxAppointments: 1000,
          features: {},
        },
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: mockSub.currentPeriodStart,
        currentPeriodEnd: mockSub.currentPeriodEnd,
        cancelAtPeriodEnd: false,
        razorpaySubscriptionId: 'sub_rzp_123',
        isExpired: false,
      });
    });

    it('should flag isExpired=true if currentPeriodEnd is in the past', async () => {
      const mockSubPlan = {
        id: 'plan-uuid',
        name: 'Growth',
        slug: 'growth',
        maxBranches: 5,
        maxStaff: 10,
        maxAppointments: 1000,
        features: {},
      };
      const mockSub = {
        id: 'sub-uuid',
        planId: 'plan-uuid',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(Date.now() - 2000000),
        currentPeriodEnd: new Date(Date.now() - 1000000),
        cancelAtPeriodEnd: false,
        razorpaySubscriptionId: 'sub_rzp_123',
        plan: mockSubPlan,
      };

      mockPrismaService.subscription.findFirst.mockResolvedValue(mockSub);

      const result = await service.getActiveSubscription(businessId);
      expect(result.isExpired).toBe(true);
    });
  });

  describe('checkout', () => {
    const businessId = 'business-uuid';
    const userId = 'user-uuid';
    const dto = {
      planSlug: 'growth',
      billingCycle: 'monthly' as const,
    };

    it('should throw NotFoundException if the plan slug is invalid', async () => {
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(null);

      await expect(service.checkout(businessId, userId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if business branch count exceeds plan limit', async () => {
      const mockPlan = { slug: 'growth', maxBranches: 3, maxStaff: 10 };
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.branch.count.mockResolvedValue(4);

      await expect(service.checkout(businessId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if business staff count exceeds plan limit', async () => {
      const mockPlan = { slug: 'growth', maxBranches: 3, maxStaff: 5 };
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.branch.count.mockResolvedValue(2);
      mockPrismaService.staff.count.mockResolvedValue(6);

      await expect(service.checkout(businessId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should call adapter to create subscription and upsert local record', async () => {
      const mockPlan = {
        id: 'plan-uuid',
        slug: 'growth',
        maxBranches: 5,
        maxStaff: 10,
      };
      const mockBusiness = {
        id: businessId,
        name: 'Glow Salon',
        email: 'glow@salon.com',
        phone: '+919876543210',
        members: [{ user: { email: 'owner@salon.com' } }],
      };

      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.branch.count.mockResolvedValue(2);
      mockPrismaService.staff.count.mockResolvedValue(4);
      mockPrismaService.business.findUnique.mockResolvedValue(mockBusiness);
      mockPrismaService.subscription.upsert.mockResolvedValue({
        id: 'mock-sub-uuid',
        businessId,
        planId: 'plan-uuid',
        status: 'PENDING',
        razorpaySubscriptionId: 'sub_rzp_999',
      });

      mockAdapter.createSubscription.mockResolvedValue({
        providerSubscriptionId: 'sub_rzp_999',
        checkoutUrl: 'https://checkout.razorpay.com/sub_rzp_999',
      });

      const result = await service.checkout(businessId, userId, dto);

      expect(result).toEqual({
        providerSubscriptionId: 'sub_rzp_999',
        checkoutUrl: 'https://checkout.razorpay.com/sub_rzp_999',
      });
      expect(mockAdapter.createSubscription).toHaveBeenCalledWith({
        planSlug: 'growth',
        billingCycle: 'monthly',
        customerName: 'Glow Salon',
        customerEmail: 'glow@salon.com',
        customerPhone: '+919876543210',
        notes: {
          businessId,
          userId,
          planId: 'plan-uuid',
          billingCycle: 'monthly',
        },
      });
      expect(prisma.subscription.upsert).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    const businessId = 'business-uuid';
    const userId = 'user-uuid';

    it('should throw NotFoundException if no active subscription is found', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue(null);

      await expect(service.cancel(businessId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if subscription is already set to cancel', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue({
        id: 'sub-uuid',
        cancelAtPeriodEnd: true,
      });

      await expect(service.cancel(businessId, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should call adapter to cancel at period end on gateway and update locally', async () => {
      const mockSub = {
        id: 'sub-uuid',
        cancelAtPeriodEnd: false,
        razorpaySubscriptionId: 'sub_rzp_123',
        status: SubscriptionStatus.ACTIVE,
      };
      mockPrismaService.subscription.findFirst.mockResolvedValue(mockSub);
      mockPrismaService.subscription.update.mockResolvedValue({
        ...mockSub,
        cancelAtPeriodEnd: true,
      });

      const result = await service.cancel(businessId, userId);

      expect(result.cancelAtPeriodEnd).toBe(true);
      expect(mockAdapter.cancelSubscription).toHaveBeenCalledWith(
        'sub_rzp_123',
        true,
      );
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-uuid' },
        data: { cancelAtPeriodEnd: true },
      });
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });
});
