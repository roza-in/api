/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../../common/utils/encryption.service';
import { PaymentAdapterFactory } from './payment-adapter.factory';
import { PaymentsService } from './payments.service';
import { PaymentStatus } from '../../generated/prisma';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    paymentConfig: {
      upsert: jest.fn(),
    },
    appointment: {
      findFirst: jest.fn(),
    },
    payment: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refund: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const mockEncryptionService = {
    encrypt: jest.fn((val) => `encrypted-${val}`),
    decrypt: jest.fn((val) => `decrypted-${val}`),
  };

  const mockAdapter = {
    createPaymentLink: jest.fn(),
    refundPayment: jest.fn(),
  };

  const mockAdapterFactory = {
    getAdapter: jest.fn(() => mockAdapter),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: PaymentAdapterFactory, useValue: mockAdapterFactory },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('saveConfig', () => {
    it('should upsert config and create audit log', async () => {
      const dto = {
        provider: 'razorpay',
        keyId: 'key_id',
        keySecret: 'key_secret',
        webhookSecret: 'webhook_secret',
        isActive: true,
      };

      await service.saveConfig('business-uuid', dto);

      expect(prisma.paymentConfig.upsert).toHaveBeenCalledWith({
        where: {
          businessId_provider: {
            businessId: 'business-uuid',
            provider: 'razorpay',
          },
        },
        create: {
          businessId: 'business-uuid',
          provider: 'razorpay',
          config: {
            keyId: 'key_id',
            keySecret: 'encrypted-key_secret',
            webhookSecret: 'encrypted-webhook_secret',
          },
          isActive: true,
        },
        update: {
          config: {
            keyId: 'key_id',
            keySecret: 'encrypted-key_secret',
            webhookSecret: 'encrypted-webhook_secret',
          },
          isActive: true,
        },
      });

      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('initializePayment', () => {
    it('should successfully create local record, invoke adapter and return link', async () => {
      const mockAppointment = {
        id: 'appointment-uuid',
        businessId: 'business-uuid',
        service: { name: 'Haircut', price: 150.0 },
        customer: {
          name: 'Rohan',
          phone: '+919999999999',
          email: 'rohan@example.com',
        },
        branch: { name: 'Main Branch' },
      };

      mockPrismaService.appointment.findFirst.mockResolvedValue(
        mockAppointment,
      );
      mockPrismaService.payment.findFirst.mockResolvedValue(null); // No existing successful payment
      mockPrismaService.payment.create.mockResolvedValue({
        id: 'payment-uuid',
        amount: 150.0,
      });

      mockAdapter.createPaymentLink.mockResolvedValue({
        providerPaymentLinkId: 'plink_123',
        paymentLinkUrl: 'https://rzp.io/i/123',
      });

      const result = await service.initializePayment(
        'business-uuid',
        'user-uuid',
        {
          appointmentId: 'appointment-uuid',
        },
      );

      expect(result).toEqual({
        paymentId: 'payment-uuid',
        paymentLinkUrl: 'https://rzp.io/i/123',
      });

      expect(prisma.payment.create).toHaveBeenCalled();
      expect(mockAdapter.createPaymentLink).toHaveBeenCalled();
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-uuid' },
        data: { providerPaymentId: 'plink_123' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if appointment is missing', async () => {
      mockPrismaService.appointment.findFirst.mockResolvedValue(null);

      await expect(
        service.initializePayment('business-uuid', 'user-uuid', {
          appointmentId: 'appointment-uuid',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if appointment is already paid', async () => {
      mockPrismaService.appointment.findFirst.mockResolvedValue({ id: '1' });
      mockPrismaService.payment.findFirst.mockResolvedValue({
        id: 'pay_success',
        status: PaymentStatus.SUCCESS,
      });

      await expect(
        service.initializePayment('business-uuid', 'user-uuid', {
          appointmentId: 'appointment-uuid',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('refundPayment', () => {
    it('should process full refund, update payment status and write audit log', async () => {
      const mockPayment = {
        id: 'payment-uuid',
        businessId: 'business-uuid',
        amount: 150.0,
        status: PaymentStatus.SUCCESS,
        provider: 'razorpay',
        providerPaymentId: 'pay_123',
        appointmentId: 'appointment-uuid',
      };

      mockPrismaService.payment.findFirst.mockResolvedValue(mockPayment);
      mockAdapter.refundPayment.mockResolvedValue({
        providerRefundId: 'rfnd_123',
        status: 'processed',
      });

      mockPrismaService.refund.create.mockResolvedValue({ id: 'refund-uuid' });

      const refund = await service.refundPayment(
        'business-uuid',
        'user-uuid',
        'payment-uuid',
        {},
      );

      expect(refund).toBeDefined();
      expect(mockAdapter.refundPayment).toHaveBeenCalledWith({
        providerPaymentId: 'pay_123',
        amount: 150.0,
        notes: { businessId: 'business-uuid', paymentId: 'payment-uuid' },
      });
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-uuid' },
        data: { status: PaymentStatus.REFUNDED, refundStatus: 'full' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if payment is not in SUCCESS state', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue({
        id: 'pay-uuid',
        status: PaymentStatus.PENDING,
      });

      await expect(
        service.refundPayment('business-uuid', 'user-uuid', 'pay-uuid', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
