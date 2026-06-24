/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionExpiryProcessor } from './subscription-expiry.processor';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionStatus } from '../../generated/prisma';
import { Job } from 'bullmq';
import { EmailAdapter } from '../notifications/adapters/email.adapter';
import { TemplateService } from '../notifications/template.service';

describe('SubscriptionExpiryProcessor', () => {
  let processor: SubscriptionExpiryProcessor;
  let prisma: PrismaService;

  const mockPrisma = {
    subscription: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    subscriptionPlan: {
      findUnique: jest.fn(),
    },
    business: {
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockEmailAdapter = {
    sendEmail: jest.fn(),
  };

  const mockTemplateService = {
    render: jest.fn().mockReturnValue({
      email: { subject: 'Reminder', html: '<p>Reminded</p>' },
    }),
  };

  beforeEach(async () => {
    mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        const cb = arg as (tx: typeof mockPrisma) => Promise<unknown>;
        return cb(mockPrisma);
      }
      return arg;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionExpiryProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailAdapter, useValue: mockEmailAdapter },
        { provide: TemplateService, useValue: mockTemplateService },
      ],
    }).compile();

    processor = module.get<SubscriptionExpiryProcessor>(
      SubscriptionExpiryProcessor,
    );
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should execute checkExpiredSubscriptions on correct job name', async () => {
      const mockJob = {
        name: 'check-expired-subscriptions',
      } as Job;

      const mockSub1 = {
        id: 'sub-uuid-1',
        businessId: 'business-uuid-1',
        status: SubscriptionStatus.ACTIVE,
      };
      const mockSub2 = {
        id: 'sub-uuid-2',
        businessId: 'business-uuid-2',
        status: SubscriptionStatus.TRIALING,
      };

      mockPrisma.subscription.findMany
        .mockResolvedValueOnce([mockSub1, mockSub2])
        .mockResolvedValueOnce([]);
      mockPrisma.subscriptionPlan.findUnique.mockResolvedValue({
        id: 'free-trial-id',
      });

      await processor.process(mockJob);

      expect(prisma.subscription.findMany).toHaveBeenCalled();
      expect(prisma.subscriptionPlan.findUnique).toHaveBeenCalledWith({
        where: { slug: 'free-trial' },
      });
      expect(prisma.subscription.update).toHaveBeenCalledTimes(2);
      expect(prisma.business.update).toHaveBeenCalledTimes(2);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-uuid-1' },
        data: { status: SubscriptionStatus.CANCELLED },
      });
      expect(prisma.business.update).toHaveBeenCalledWith({
        where: { id: 'business-uuid-1' },
        data: {
          planId: 'free-trial-id',
          subscriptionStatus: SubscriptionStatus.CANCELLED,
        },
      });
    });

    it('should ignore jobs with unknown names', async () => {
      const mockJob = {
        name: 'unknown-job-name',
      } as Job;

      await processor.process(mockJob);

      expect(prisma.subscription.findMany).not.toHaveBeenCalled();
    });

    it('should continue processing remaining subscriptions if one fails', async () => {
      const mockJob = {
        name: 'check-expired-subscriptions',
      } as Job;

      const mockSub1 = {
        id: 'sub-uuid-1',
        businessId: 'business-uuid-1',
        status: SubscriptionStatus.ACTIVE,
      };
      const mockSub2 = {
        id: 'sub-uuid-2',
        businessId: 'business-uuid-2',
        status: SubscriptionStatus.TRIALING,
      };

      mockPrisma.subscription.findMany
        .mockResolvedValueOnce([mockSub1, mockSub2])
        .mockResolvedValueOnce([]);
      mockPrisma.subscriptionPlan.findUnique.mockResolvedValue({
        id: 'free-trial-id',
      });

      // First call to update fails, second succeeds
      mockPrisma.subscription.update
        .mockRejectedValueOnce(new Error('DB error on sub 1'))
        .mockResolvedValueOnce({});

      await processor.process(mockJob);

      // Verify second sub was still processed
      expect(prisma.subscription.update).toHaveBeenCalledTimes(2);
      expect(prisma.business.update).toHaveBeenCalledTimes(1);
      expect(prisma.business.update).toHaveBeenCalledWith({
        where: { id: 'business-uuid-2' },
        data: {
          planId: 'free-trial-id',
          subscriptionStatus: SubscriptionStatus.CANCELLED,
        },
      });
    });

    it('should send trial/expiration reminder emails for expiring subscriptions', async () => {
      const mockJob = {
        name: 'check-expired-subscriptions',
      } as Job;

      mockPrisma.subscription.findMany
        .mockResolvedValueOnce([]) // expired (empty)
        .mockResolvedValueOnce([
          // expiring
          {
            id: 'sub-uuid-expiring',
            currentPeriodEnd: new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000),
            businessId: 'business-uuid-1',
            business: {
              members: [
                {
                  user: {
                    email: 'owner@example.com',
                    name: 'Owner Name',
                  },
                },
              ],
            },
          },
        ]);

      await processor.process(mockJob);

      expect(mockTemplateService.render).toHaveBeenCalledWith(
        'TRIAL_REMINDER',
        expect.any(Object),
        'email',
      );
      expect(mockEmailAdapter.sendEmail).toHaveBeenCalledWith(
        'owner@example.com',
        'Reminder',
        '<p>Reminded</p>',
      );
    });
  });
});
