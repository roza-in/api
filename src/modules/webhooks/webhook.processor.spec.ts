/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { WebhookProcessor } from './webhook.processor';
import {
  PaymentStatus,
  WebhookStatus,
  SubscriptionStatus,
} from '../../generated/prisma';
import { Job } from 'bullmq';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('WebhookProcessor', () => {
  let processor: WebhookProcessor;
  let prisma: PrismaService;
  let customersService: CustomersService;

  const mockPrismaService = {
    webhookEvent: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    payment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    appointment: {
      findFirst: jest.fn(),
    },
    invoice: {
      count: jest.fn(),
      create: jest.fn(),
    },
    refund: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    business: {
      update: jest.fn(),
    },
    subscriptionPlan: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    notification: {
      findFirst: jest.fn(),
    },
    campaign: {
      update: jest.fn(),
    },
  };

  const mockCustomersService = {
    recalculateTotalSpent: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookProcessor,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CustomersService, useValue: mockCustomersService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    processor = module.get<WebhookProcessor>(WebhookProcessor);
    prisma = module.get<PrismaService>(PrismaService);
    customersService = module.get<CustomersService>(CustomersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should route process-razorpay job to event processors', async () => {
      const mockJob = {
        name: 'process-razorpay',
        data: { eventId: 'event-uuid', businessId: 'business-uuid' },
      } as unknown as Job;

      mockPrismaService.webhookEvent.findUnique.mockResolvedValue({
        id: 'event-uuid',
        status: WebhookStatus.PENDING,
        eventType: 'payment.captured',
        payload: {
          payload: {
            payment: {
              entity: {
                id: 'pay_123',
                notes: { paymentId: 'payment-uuid' },
              },
            },
          },
        },
      });

      mockPrismaService.payment.findFirst.mockResolvedValue({
        id: 'payment-uuid',
        appointmentId: 'appointment-uuid',
        amount: 150.0,
        status: PaymentStatus.PENDING,
      });

      mockPrismaService.payment.update.mockResolvedValue({
        id: 'payment-uuid',
        appointmentId: 'appointment-uuid',
        amount: 150.0,
        status: PaymentStatus.SUCCESS,
      });

      mockPrismaService.invoice.count.mockResolvedValue(0);
      mockPrismaService.appointment.findFirst.mockResolvedValue({
        id: 'appointment-uuid',
        customerId: 'customer-uuid',
      });

      await processor.process(mockJob);

      expect(prisma.webhookEvent.findUnique).toHaveBeenCalledWith({
        where: { id: 'event-uuid' },
      });

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-uuid' },
        data: {
          status: PaymentStatus.SUCCESS,
          providerPaymentId: 'pay_123',
          providerOrderId: null,
        },
      });

      expect(prisma.invoice.create).toHaveBeenCalled();
      expect(customersService.recalculateTotalSpent).toHaveBeenCalledWith(
        'business-uuid',
        'customer-uuid',
      );
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'event-uuid' },
        data: {
          status: WebhookStatus.PROCESSED,
          processedAt: expect.any(Date),
        },
      });
    });

    it('should handle payment.failed event', async () => {
      const mockJob = {
        name: 'process-razorpay',
        data: { eventId: 'event-uuid', businessId: 'business-uuid' },
      } as unknown as Job;

      mockPrismaService.webhookEvent.findUnique.mockResolvedValue({
        id: 'event-uuid',
        status: WebhookStatus.PENDING,
        eventType: 'payment.failed',
        payload: {
          payload: {
            payment: {
              entity: {
                id: 'pay_123',
                notes: { paymentId: 'payment-uuid' },
              },
            },
          },
        },
      });

      mockPrismaService.payment.findFirst.mockResolvedValue({
        id: 'payment-uuid',
        status: PaymentStatus.PENDING,
      });

      await processor.process(mockJob);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-uuid' },
        data: { status: PaymentStatus.FAILED },
      });
    });

    it('should handle refund.processed event', async () => {
      const mockJob = {
        name: 'process-razorpay',
        data: { eventId: 'event-uuid', businessId: 'business-uuid' },
      } as unknown as Job;

      mockPrismaService.webhookEvent.findUnique.mockResolvedValue({
        id: 'event-uuid',
        status: WebhookStatus.PENDING,
        eventType: 'refund.processed',
        payload: {
          payload: {
            refund: {
              entity: {
                id: 'rfnd_123',
                payment_id: 'pay_123',
                amount: 15000,
              },
            },
          },
        },
      });

      mockPrismaService.payment.findUnique.mockResolvedValue({
        id: 'payment-uuid',
        providerPaymentId: 'pay_123',
        amount: 150.0,
        appointmentId: 'appointment-uuid',
      });

      mockPrismaService.refund.findUnique.mockResolvedValue(null);
      mockPrismaService.refund.create.mockResolvedValue({ id: 'refund-uuid' });
      mockPrismaService.refund.aggregate.mockResolvedValue({
        _sum: { amount: 150.0 },
      });

      mockPrismaService.appointment.findFirst.mockResolvedValue({
        id: 'appointment-uuid',
        customerId: 'customer-uuid',
      });

      await processor.process(mockJob);

      expect(prisma.refund.create).toHaveBeenCalled();
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-uuid' },
        data: { status: PaymentStatus.REFUNDED, refundStatus: 'full' },
      });
    });

    it('should route process-razorpay-platform job for subscription.charged', async () => {
      const mockJob = {
        name: 'process-razorpay-platform',
        data: { eventId: 'event-platform-uuid', businessId: 'business-uuid' },
      } as unknown as Job;

      mockPrismaService.webhookEvent.findUnique.mockResolvedValue({
        id: 'event-platform-uuid',
        status: WebhookStatus.PENDING,
        eventType: 'subscription.charged',
        payload: {
          payload: {
            subscription: {
              entity: {
                id: 'sub_rzp_123',
                current_start: 1770000000,
                current_end: 1780000000,
                notes: {
                  planId: 'new-plan-uuid',
                },
              },
            },
          },
        },
      });

      mockPrismaService.subscription.findUnique.mockResolvedValue(null);
      mockPrismaService.subscriptionPlan.findUniqueOrThrow.mockResolvedValue({
        id: 'new-plan-uuid',
        priceMonthly: 2000,
        priceYearly: 20000,
      });
      mockPrismaService.subscription.create.mockResolvedValue({
        id: 'local-sub-uuid',
        planId: 'new-plan-uuid',
        status: SubscriptionStatus.ACTIVE,
      });

      await processor.process(mockJob);

      expect(prisma.webhookEvent.findUnique).toHaveBeenCalledWith({
        where: { id: 'event-platform-uuid' },
      });
      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: {
          businessId: 'business-uuid',
          planId: 'new-plan-uuid',
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(1770000000 * 1000),
          currentPeriodEnd: new Date(1780000000 * 1000),
          razorpaySubscriptionId: 'sub_rzp_123',
          billingInterval: 'yearly',
          amount: 20000,
        },
      });
      expect(prisma.business.update).toHaveBeenCalledWith({
        where: { id: 'business-uuid' },
        data: {
          planId: 'new-plan-uuid',
          subscriptionStatus: SubscriptionStatus.ACTIVE,
        },
      });
    });

    it('should route process-razorpay-platform job for subscription.cancelled', async () => {
      const mockJob = {
        name: 'process-razorpay-platform',
        data: { eventId: 'event-platform-uuid', businessId: 'business-uuid' },
      } as unknown as Job;

      mockPrismaService.webhookEvent.findUnique.mockResolvedValue({
        id: 'event-platform-uuid',
        status: WebhookStatus.PENDING,
        eventType: 'subscription.cancelled',
        payload: {
          payload: {
            subscription: {
              entity: {
                id: 'sub_rzp_123',
              },
            },
          },
        },
      });

      mockPrismaService.subscription.findUnique.mockResolvedValue({
        id: 'local-sub-uuid',
        planId: 'new-plan-uuid',
      });
      mockPrismaService.subscriptionPlan.findUnique.mockResolvedValue({
        id: 'free-trial-plan-uuid',
      });

      await processor.process(mockJob);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'local-sub-uuid' },
        data: { status: SubscriptionStatus.CANCELLED },
      });
      expect(prisma.business.update).toHaveBeenCalledWith({
        where: { id: 'business-uuid' },
        data: {
          planId: 'free-trial-plan-uuid',
          subscriptionStatus: SubscriptionStatus.CANCELLED,
        },
      });
    });
  });
});
