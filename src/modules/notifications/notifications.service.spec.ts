/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ConsentService } from './consent.service';
import { TemplateService } from './template.service';
import { getQueueToken } from '@nestjs/bullmq';
import { QUEUE_NOTIFICATIONS } from '../queue/queue.constants';
import { BadRequestException } from '@nestjs/common';

const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
};
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('NotificationsService', () => {
  let service: NotificationsService;

  const mockPrismaService = {
    notification: {
      create: jest.fn(),
    },
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
  };

  const mockConsentService = {
    hasConsent: jest.fn(),
  };

  const mockTemplateService = {
    render: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: ConsentService, useValue: mockConsentService },
        { provide: TemplateService, useValue: mockTemplateService },
        { provide: getQueueToken(QUEUE_NOTIFICATIONS), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('send', () => {
    it('should queue a notification job and return log record when consent and rate limits pass', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockConsentService.hasConsent.mockResolvedValue(true);
      mockPrismaService.notification.create.mockResolvedValue({
        id: 'notification-uuid',
        status: 'PENDING',
      });

      const result = await service.send({
        businessId: 'business-uuid',
        customerId: 'customer-uuid',
        templateId: 'APPOINTMENT_CONFIRMATION',
        variables: { customerName: 'Rahul' },
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('notification-uuid');
      expect(mockRedis.incr).toHaveBeenCalledWith(
        'ratelimit:notify:business-uuid:customer-uuid:transactional',
      );
      expect(mockRedis.expire).toHaveBeenCalledWith(
        'ratelimit:notify:business-uuid:customer-uuid:transactional',
        86400,
      );
      expect(mockConsentService.hasConsent).toHaveBeenCalledWith(
        'business-uuid',
        'customer-uuid',
        'transactional',
        'whatsapp',
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-notification',
        {
          notificationId: 'notification-uuid',
          variables: { customerName: 'Rahul' },
        },
        expect.any(Object),
      );
    });

    it('should throw BadRequestException when rate limits are exceeded', async () => {
      // Limit is 5 for transactional, return 6
      mockRedis.incr.mockResolvedValue(6);

      await expect(
        service.send({
          businessId: 'business-uuid',
          customerId: 'customer-uuid',
          templateId: 'APPOINTMENT_CONFIRMATION',
          variables: {},
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when consent is not granted', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockConsentService.hasConsent.mockResolvedValue(false); // No WhatsApp and no SMS fallback consent

      await expect(
        service.send({
          businessId: 'business-uuid',
          customerId: 'customer-uuid',
          templateId: 'APPOINTMENT_CONFIRMATION',
          variables: {},
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should respect preferredChannel if specified and consent is granted', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockConsentService.hasConsent.mockResolvedValue(true);

      mockPrismaService.notification.create.mockResolvedValue({
        id: 'notification-uuid-sms',
        status: 'PENDING',
        channel: 'SMS',
      });

      const result = await service.send({
        businessId: 'business-uuid',
        customerId: 'customer-uuid',
        templateId: 'APPOINTMENT_CONFIRMATION',
        variables: {},
        preferredChannel: 'sms',
      });

      expect(result).toBeDefined();
      expect(mockConsentService.hasConsent).toHaveBeenCalledWith(
        'business-uuid',
        'customer-uuid',
        'transactional',
        'sms',
      );
      expect(mockPrismaService.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: 'SMS',
            provider: 'msg91',
          }),
        }),
      );
    });
  });
});
