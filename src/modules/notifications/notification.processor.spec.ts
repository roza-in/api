import { Test, TestingModule } from '@nestjs/testing';
import { NotificationProcessor } from './notification.processor';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { WhatsAppAdapter } from './adapters/whatsapp.adapter';
import { SmsAdapter } from './adapters/sms.adapter';
import { EmailAdapter } from './adapters/email.adapter';
import { TemplateService } from './template.service';
import { NotificationsService } from './notifications.service';
import { Job } from 'bullmq';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;

  const mockPrismaService = {
    notification: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    appointment: {
      findMany: jest.fn(),
    },
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
  };

  const mockWhatsAppAdapter = {
    sendTemplate: jest.fn(),
  };

  const mockSmsAdapter = {
    sendSms: jest.fn(),
  };

  const mockEmailAdapter = {
    sendEmail: jest.fn(),
  };

  const mockTemplateService = {
    render: jest.fn(),
  };

  const mockNotificationsService = {
    send: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationProcessor,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: WhatsAppAdapter, useValue: mockWhatsAppAdapter },
        { provide: SmsAdapter, useValue: mockSmsAdapter },
        { provide: EmailAdapter, useValue: mockEmailAdapter },
        { provide: TemplateService, useValue: mockTemplateService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    processor = module.get<NotificationProcessor>(NotificationProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should send WhatsApp notification successfully', async () => {
      const mockJob = {
        name: 'send-notification',
        data: {
          notificationId: 'notif-uuid',
          variables: { customerName: 'Rahul' },
        },
      } as unknown as Job;

      mockPrismaService.notification.findUnique.mockResolvedValue({
        id: 'notif-uuid',
        status: 'PENDING',
        channel: 'WHATSAPP',
        templateId: 'APPOINTMENT_CONFIRMATION',
        customer: { id: 'cust-uuid', phone: '919999999999' },
      });

      mockTemplateService.render.mockReturnValue({
        whatsapp: {
          templateName: 'appointment_confirmation',
          language: 'en',
          parameters: ['Rahul'],
        },
      });

      mockWhatsAppAdapter.sendTemplate.mockResolvedValue('wamid.123');

      await processor.process(mockJob);

      expect(mockWhatsAppAdapter.sendTemplate).toHaveBeenCalledWith(
        '919999999999',
        'appointment_confirmation',
        'en',
        ['Rahul'],
      );

      expect(mockPrismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-uuid' },
        data: {
          status: 'SENT',
          sentAt: expect.any(Date),
        },
      });
    });

    it('should throw error and mark failed when WhatsApp fails without SMS fallback', async () => {
      const mockJob = {
        name: 'send-notification',
        data: {
          notificationId: 'notif-uuid',
          variables: { customerName: 'Rahul' },
        },
      } as unknown as Job;

      mockPrismaService.notification.findUnique.mockImplementation(
        (args: { where: { id: string } }) => {
          if (args.where.id === 'notif-uuid') {
            return Promise.resolve({
              id: 'notif-uuid',
              businessId: 'business-uuid',
              customerId: 'customer-uuid',
              status: 'PENDING',
              channel: 'WHATSAPP',
              templateId: 'APPOINTMENT_CONFIRMATION',
              customer: { id: 'customer-uuid', phone: '919999999999' },
            });
          }
          return Promise.resolve(null);
        },
      );

      mockTemplateService.render.mockImplementation(
        (templateId, vars, channel) => {
          return {
            whatsapp: {
              templateName: 'appointment_confirmation',
              language: 'en',
              parameters: ['Rahul'],
            },
          };
        },
      );

      mockWhatsAppAdapter.sendTemplate.mockRejectedValue(
        new Error('Meta API Down'),
      );

      await expect(processor.process(mockJob)).rejects.toThrow('Meta API Down');

      // Verify original WhatsApp notification updated to failed
      expect(mockPrismaService.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif-uuid' },
          data: expect.objectContaining({
            status: 'FAILED',
            failedAt: expect.any(Date),
          }),
        }),
      );

      // Verify SMS fallback is NOT triggered (create not called)
      expect(mockPrismaService.notification.create).not.toHaveBeenCalled();
    });

    it('should send SMS notification successfully', async () => {
      const mockJob = {
        name: 'send-notification',
        data: {
          notificationId: 'notif-uuid',
          variables: { customerName: 'Rahul' },
        },
      } as unknown as Job;

      mockPrismaService.notification.findUnique.mockResolvedValue({
        id: 'notif-uuid',
        status: 'PENDING',
        channel: 'SMS',
        templateId: 'APPOINTMENT_CONFIRMATION',
        customer: { id: 'cust-uuid', phone: '919999999999' },
      });

      mockTemplateService.render.mockReturnValue({
        sms: {
          templateId: 'flow_appointment_conf',
          variables: { customerName: 'Rahul' },
        },
      });

      mockSmsAdapter.sendSms.mockResolvedValue('msg91-req-123');

      await processor.process(mockJob);

      expect(mockSmsAdapter.sendSms).toHaveBeenCalledWith(
        '919999999999',
        'flow_appointment_conf',
        { customerName: 'Rahul' },
      );

      expect(mockPrismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-uuid' },
        data: {
          status: 'SENT',
          sentAt: expect.any(Date),
        },
      });
    });

    it('should send Email notification successfully', async () => {
      const mockJob = {
        name: 'send-notification',
        data: {
          notificationId: 'notif-uuid',
          variables: { customerName: 'Rahul' },
        },
      } as unknown as Job;

      mockPrismaService.notification.findUnique.mockResolvedValue({
        id: 'notif-uuid',
        status: 'PENDING',
        channel: 'EMAIL',
        templateId: 'APPOINTMENT_CONFIRMATION',
        customer: { id: 'cust-uuid', email: 'rahul@gmail.com' },
      });

      mockTemplateService.render.mockReturnValue({
        email: {
          subject: 'Confirm',
          html: '<h1>Hi</h1>',
        },
      });

      mockEmailAdapter.sendEmail.mockResolvedValue('ses-id-123');

      await processor.process(mockJob);

      expect(mockEmailAdapter.sendEmail).toHaveBeenCalledWith(
        'rahul@gmail.com',
        'Confirm',
        '<h1>Hi</h1>',
      );

      expect(mockPrismaService.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-uuid' },
        data: {
          status: 'SENT',
          sentAt: expect.any(Date),
        },
      });
    });
  });
});
