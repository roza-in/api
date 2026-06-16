/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../../common/utils/encryption.service';
import { PaymentAdapterFactory } from './payment-adapter.factory';
import { RazorpayAdapter } from './adapters/razorpay.adapter';

describe('PaymentAdapterFactory', () => {
  let factory: PaymentAdapterFactory;
  let prisma: PrismaService;
  let encryptionService: EncryptionService;

  const mockPrismaService = {
    paymentConfig: {
      findUnique: jest.fn(),
    },
  };

  const mockEncryptionService = {
    decrypt: jest.fn((val) => `decrypted-${val}`),
    encrypt: jest.fn((val) => `encrypted-${val}`),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentAdapterFactory,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();

    factory = module.get<PaymentAdapterFactory>(PaymentAdapterFactory);
    prisma = module.get<PrismaService>(PrismaService);
    encryptionService = module.get<EncryptionService>(EncryptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAdapter', () => {
    it('should successfully return RazorpayAdapter when config is valid and active', async () => {
      const configVal = {
        keyId: 'rzp_key_id',
        keySecret: 'encrypted-secret',
      };
      mockPrismaService.paymentConfig.findUnique.mockResolvedValue({
        id: 'config-uuid',
        businessId: 'business-uuid',
        provider: 'razorpay',
        config: configVal,
        isActive: true,
      });

      const adapter = await factory.getAdapter('business-uuid', 'razorpay');

      expect(adapter).toBeInstanceOf(RazorpayAdapter);
      expect(prisma.paymentConfig.findUnique).toHaveBeenCalledWith({
        where: {
          businessId_provider: {
            businessId: 'business-uuid',
            provider: 'razorpay',
          },
        },
      });
      expect(encryptionService.decrypt).toHaveBeenCalledWith(
        'encrypted-secret',
      );
    });

    it('should throw BadRequestException if config is not found', async () => {
      mockPrismaService.paymentConfig.findUnique.mockResolvedValue(null);

      await expect(
        factory.getAdapter('business-uuid', 'razorpay'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if config is inactive', async () => {
      mockPrismaService.paymentConfig.findUnique.mockResolvedValue({
        id: 'config-uuid',
        businessId: 'business-uuid',
        provider: 'razorpay',
        config: {},
        isActive: false,
      });

      await expect(
        factory.getAdapter('business-uuid', 'razorpay'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for unsupported providers', async () => {
      mockPrismaService.paymentConfig.findUnique.mockResolvedValue({
        id: 'config-uuid',
        businessId: 'business-uuid',
        provider: 'unknown-provider',
        config: { keyId: '1', keySecret: '2' },
        isActive: true,
      });

      await expect(
        factory.getAdapter('business-uuid', 'unknown-provider'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getWebhookSecret', () => {
    it('should successfully return decrypted webhook secret', async () => {
      mockPrismaService.paymentConfig.findUnique.mockResolvedValue({
        id: 'config-uuid',
        businessId: 'business-uuid',
        provider: 'razorpay',
        config: { webhookSecret: 'enc-webhook-secret' },
        isActive: true,
      });

      const secret = await factory.getWebhookSecret(
        'business-uuid',
        'razorpay',
      );

      expect(secret).toEqual('decrypted-enc-webhook-secret');
      expect(encryptionService.decrypt).toHaveBeenCalledWith(
        'enc-webhook-secret',
      );
    });

    it('should throw BadRequestException if webhook secret is missing in config', async () => {
      mockPrismaService.paymentConfig.findUnique.mockResolvedValue({
        id: 'config-uuid',
        businessId: 'business-uuid',
        provider: 'razorpay',
        config: { keyId: '1' },
        isActive: true,
      });

      await expect(
        factory.getWebhookSecret('business-uuid', 'razorpay'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
