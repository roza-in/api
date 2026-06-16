/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentAdapterFactory } from '../payments/payment-adapter.factory';
import { getQueueToken } from '@nestjs/bullmq';
import { QUEUE_WEBHOOKS } from '../queue/queue.constants';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { validateWebhookSignature } from 'razorpay/dist/utils/razorpay-utils';

jest.mock('razorpay/dist/utils/razorpay-utils');

const mockValidateWebhookSignature =
  validateWebhookSignature as unknown as jest.Mock;

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let prisma: PrismaService;
  let adapterFactory: PaymentAdapterFactory;
  let queue: Queue;

  const mockPrismaService = {
    webhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockAdapter = {
    verifyWebhookSignature: jest.fn(),
  };

  const mockAdapterFactory = {
    getWebhookSecret: jest.fn(),
    getAdapter: jest.fn(() => mockAdapter),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'RAZORPAY_WEBHOOK_SECRET') return 'platform-webhook-secret';
      if (key === 'RAZORPAY_KEY_ID') return 'platform-key-id';
      if (key === 'RAZORPAY_KEY_SECRET') return 'platform-key-secret';
      return '';
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PaymentAdapterFactory, useValue: mockAdapterFactory },
        { provide: getQueueToken(QUEUE_WEBHOOKS), useValue: mockQueue },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
    prisma = module.get<PrismaService>(PrismaService);
    adapterFactory = module.get<PaymentAdapterFactory>(PaymentAdapterFactory);
    queue = module.get(getQueueToken(QUEUE_WEBHOOKS));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleRazorpay', () => {
    const businessId = 'business-uuid';
    const mockPayload = {
      event_id: 'evt_123',
      event: 'payment.captured',
    };
    const mockReq = {
      rawBody: Buffer.from(JSON.stringify(mockPayload)),
      headers: {
        'x-razorpay-signature': 'valid-sig',
      },
    } as any;

    it('should successfully queue the event when signature is valid', async () => {
      mockAdapterFactory.getWebhookSecret.mockResolvedValue('webhook-secret');
      mockAdapter.verifyWebhookSignature.mockReturnValue(true);
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue(null);
      mockPrismaService.webhookEvent.create.mockResolvedValue({
        id: 'webhook-event-id',
      });

      const result = await controller.handleRazorpay(businessId, mockReq);

      expect(result).toEqual({ status: 'accepted' });
      expect(adapterFactory.getWebhookSecret).toHaveBeenCalledWith(
        businessId,
        'razorpay',
      );
      expect(mockAdapter.verifyWebhookSignature).toHaveBeenCalledWith(
        JSON.stringify(mockPayload),
        'valid-sig',
        'webhook-secret',
      );
      expect(prisma.webhookEvent.create).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        'process-razorpay',
        { eventId: 'webhook-event-id', businessId },
        expect.any(Object),
      );
    });

    it('should throw UnauthorizedException if signature header is missing', async () => {
      const badReq = {
        rawBody: Buffer.from('data'),
        headers: {},
      } as any;

      await expect(
        controller.handleRazorpay(businessId, badReq),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if signature is invalid', async () => {
      mockAdapterFactory.getWebhookSecret.mockResolvedValue('webhook-secret');
      mockAdapter.verifyWebhookSignature.mockReturnValue(false);

      await expect(
        controller.handleRazorpay(businessId, mockReq),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return already_processed if duplicate event ID exists', async () => {
      mockAdapterFactory.getWebhookSecret.mockResolvedValue('webhook-secret');
      mockAdapter.verifyWebhookSignature.mockReturnValue(true);
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue({
        id: 'old-event',
      });

      const result = await controller.handleRazorpay(businessId, mockReq);

      expect(result).toEqual({ status: 'already_processed' });
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('handleRazorpayPlatform', () => {
    const mockPlatformPayload = {
      event_id: 'evt_platform_123',
      event: 'subscription.charged',
      payload: {
        subscription: {
          entity: {
            notes: {
              businessId: 'business-uuid',
            },
          },
        },
      },
    };
    const mockReq = {
      rawBody: Buffer.from(JSON.stringify(mockPlatformPayload)),
      headers: {
        'x-razorpay-signature': 'platform-sig',
      },
    } as any;

    it('should successfully queue the platform event when signature is valid', async () => {
      mockValidateWebhookSignature.mockReturnValue(true);
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue(null);
      mockPrismaService.webhookEvent.create.mockResolvedValue({
        id: 'webhook-platform-event-id',
      });

      const result = await controller.handleRazorpayPlatform(mockReq);

      expect(result).toEqual({ status: 'accepted' });
      expect(mockValidateWebhookSignature).toHaveBeenCalledWith(
        JSON.stringify(mockPlatformPayload),
        'platform-sig',
        'platform-webhook-secret',
      );
      expect(prisma.webhookEvent.create).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        'process-razorpay-platform',
        { eventId: 'webhook-platform-event-id', businessId: 'business-uuid' },
        expect.any(Object),
      );
    });

    it('should throw UnauthorizedException if signature is invalid', async () => {
      mockValidateWebhookSignature.mockReturnValue(false);

      await expect(controller.handleRazorpayPlatform(mockReq)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return already_processed if duplicate event ID exists', async () => {
      mockValidateWebhookSignature.mockReturnValue(true);
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue({
        id: 'old-platform-event',
      });

      const result = await controller.handleRazorpayPlatform(mockReq);

      expect(result).toEqual({ status: 'already_processed' });
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if businessId is missing in notes', async () => {
      mockValidateWebhookSignature.mockReturnValue(true);
      mockPrismaService.webhookEvent.findUnique.mockResolvedValue(null);

      const noBusinessIdReq = {
        rawBody: Buffer.from(
          JSON.stringify({
            event_id: 'evt_platform_123',
            event: 'subscription.charged',
            payload: {
              subscription: {
                entity: {
                  notes: {},
                },
              },
            },
          }),
        ),
        headers: {
          'x-razorpay-signature': 'platform-sig',
        },
      } as any;

      await expect(
        controller.handleRazorpayPlatform(noBusinessIdReq),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
