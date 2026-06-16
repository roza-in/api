import { Test, TestingModule } from '@nestjs/testing';
import { EntitlementsService } from './entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('EntitlementsService', () => {
  let service: EntitlementsService;

  const mockPrisma = {
    business: {
      findUnique: jest.fn(),
    },
    subscriptionPlan: {
      findUnique: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
    },
    branch: {
      count: jest.fn(),
    },
    staff: {
      count: jest.fn(),
    },
    appointment: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitlementsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<EntitlementsService>(EntitlementsService);

    jest.clearAllMocks();
  });

  describe('getPlanForBusiness', () => {
    const businessId = 'business-uuid';

    it('should throw NotFoundException if business does not exist', async () => {
      mockPrisma.business.findUnique.mockResolvedValue(null);

      await expect(service.getPlanForBusiness(businessId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return plan from active subscription if not expired', async () => {
      const mockBusiness = { id: businessId, planId: 'plan-uuid' };
      const mockPlan = { id: 'plan-uuid', name: 'Starter' };
      const mockSubscription = {
        id: 'sub-uuid',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000000),
        plan: mockPlan,
      };
      mockPrisma.business.findUnique.mockResolvedValue(mockBusiness);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockSubscription);

      const result = await service.getPlanForBusiness(businessId);

      expect(result).toEqual(mockPlan);
      expect(mockPrisma.subscription.findFirst).toHaveBeenCalledWith({
        where: { businessId, status: { in: ['ACTIVE', 'TRIALING'] } },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should throw ForbiddenException if active subscription is missing', async () => {
      const mockBusiness = { id: businessId, planId: null };
      mockPrisma.business.findUnique.mockResolvedValue(mockBusiness);
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await expect(service.getPlanForBusiness(businessId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if trialing subscription is expired', async () => {
      const mockBusiness = { id: businessId };
      const mockPlan = { id: 'plan-uuid', name: 'Free Trial' };
      const mockSubscription = {
        id: 'sub-uuid',
        status: 'TRIALING',
        currentPeriodStart: new Date(Date.now() - 2000000),
        currentPeriodEnd: new Date(Date.now() - 1000000),
        plan: mockPlan,
      };
      mockPrisma.business.findUnique.mockResolvedValue(mockBusiness);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockSubscription);

      await expect(service.getPlanForBusiness(businessId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if active subscription is expired', async () => {
      const mockBusiness = { id: businessId };
      const mockPlan = { id: 'plan-uuid', name: 'Starter' };
      const mockSubscription = {
        id: 'sub-uuid',
        status: 'ACTIVE',
        currentPeriodStart: new Date(Date.now() - 2000000),
        currentPeriodEnd: new Date(Date.now() - 1000000),
        plan: mockPlan,
      };
      mockPrisma.business.findUnique.mockResolvedValue(mockBusiness);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockSubscription);

      await expect(service.getPlanForBusiness(businessId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('hasFeature', () => {
    const businessId = 'business-uuid';

    it('should return true if feature is enabled in plan', async () => {
      const mockBusiness = { id: businessId, planId: 'plan-uuid' };
      const mockPlan = { id: 'plan-uuid', features: { customDomain: true } };
      const mockSubscription = {
        id: 'sub-uuid',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000000),
        plan: mockPlan,
      };
      mockPrisma.business.findUnique.mockResolvedValue(mockBusiness);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockSubscription);

      const result = await service.hasFeature(businessId, 'customDomain');
      expect(result).toBe(true);
    });

    it('should return false if feature is disabled in plan', async () => {
      const mockBusiness = { id: businessId, planId: 'plan-uuid' };
      const mockPlan = { id: 'plan-uuid', features: { customDomain: false } };
      const mockSubscription = {
        id: 'sub-uuid',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000000),
        plan: mockPlan,
      };
      mockPrisma.business.findUnique.mockResolvedValue(mockBusiness);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockSubscription);

      const result = await service.hasFeature(businessId, 'customDomain');
      expect(result).toBe(false);
    });
  });

  describe('assertBranchLimit', () => {
    const businessId = 'business-uuid';

    it('should throw ForbiddenException if current branch count equals or exceeds plan limit', async () => {
      const mockBusiness = { id: businessId, planId: 'plan-uuid' };
      const mockPlan = { id: 'plan-uuid', maxBranches: 2 };
      const mockSubscription = {
        id: 'sub-uuid',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000000),
        plan: mockPlan,
      };
      mockPrisma.business.findUnique.mockResolvedValue(mockBusiness);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockSubscription);
      mockPrisma.branch.count.mockResolvedValue(2);

      await expect(service.assertBranchLimit(businessId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow branch creation if count is below plan limit', async () => {
      const mockBusiness = { id: businessId, planId: 'plan-uuid' };
      const mockPlan = { id: 'plan-uuid', maxBranches: 2 };
      const mockSubscription = {
        id: 'sub-uuid',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000000),
        plan: mockPlan,
      };
      mockPrisma.business.findUnique.mockResolvedValue(mockBusiness);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockSubscription);
      mockPrisma.branch.count.mockResolvedValue(1);

      await expect(
        service.assertBranchLimit(businessId),
      ).resolves.not.toThrow();
    });
  });

  describe('assertStaffLimit', () => {
    const businessId = 'business-uuid';

    it('should throw ForbiddenException if current staff count equals or exceeds plan limit', async () => {
      const mockBusiness = { id: businessId, planId: 'plan-uuid' };
      const mockPlan = { id: 'plan-uuid', maxStaff: 5 };
      const mockSubscription = {
        id: 'sub-uuid',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000000),
        plan: mockPlan,
      };
      mockPrisma.business.findUnique.mockResolvedValue(mockBusiness);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockSubscription);
      mockPrisma.staff.count.mockResolvedValue(5);

      await expect(service.assertStaffLimit(businessId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow staff creation if count is below plan limit', async () => {
      const mockBusiness = { id: businessId, planId: 'plan-uuid' };
      const mockPlan = { id: 'plan-uuid', maxStaff: 5 };
      const mockSubscription = {
        id: 'sub-uuid',
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000000),
        plan: mockPlan,
      };
      mockPrisma.business.findUnique.mockResolvedValue(mockBusiness);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockSubscription);
      mockPrisma.staff.count.mockResolvedValue(4);

      await expect(service.assertStaffLimit(businessId)).resolves.not.toThrow();
    });
  });

  describe('assertAppointmentLimit', () => {
    const businessId = 'business-uuid';

    it('should throw ForbiddenException if appointment count in current billing cycle exceeds limit', async () => {
      const mockBusiness = { id: businessId, planId: 'plan-uuid' };
      const mockPlan = { id: 'plan-uuid', maxAppointments: 100 };
      const mockSubscription = {
        id: 'sub-uuid',
        status: 'ACTIVE',
        currentPeriodStart: new Date('2026-06-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-07-01T00:00:00Z'),
        plan: mockPlan,
      };
      mockPrisma.business.findUnique.mockResolvedValue(mockBusiness);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockSubscription);
      mockPrisma.appointment.count.mockResolvedValue(100);

      await expect(service.assertAppointmentLimit(businessId)).rejects.toThrow(
        ForbiddenException,
      );

      expect(mockPrisma.appointment.count).toHaveBeenCalledWith({
        where: {
          businessId,
          createdAt: {
            gte: mockSubscription.currentPeriodStart,
            lte: mockSubscription.currentPeriodEnd,
          },
          deletedAt: null,
        },
      });
    });

    it('should allow appointment creation if count is below limit', async () => {
      const mockBusiness = { id: businessId, planId: 'plan-uuid' };
      const mockPlan = { id: 'plan-uuid', maxAppointments: 100 };
      const mockSubscription = {
        id: 'sub-uuid',
        status: 'ACTIVE',
        currentPeriodStart: null,
        currentPeriodEnd: new Date(Date.now() + 1000000),
        plan: mockPlan,
      };
      mockPrisma.business.findUnique.mockResolvedValue(mockBusiness);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockSubscription);
      mockPrisma.appointment.count.mockResolvedValue(99);

      await expect(
        service.assertAppointmentLimit(businessId),
      ).resolves.not.toThrow();
    });
  });
});
