import { Test, TestingModule } from '@nestjs/testing';
import { ConsentService } from './consent.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentType, ConsentSource } from '../../generated/prisma';

describe('ConsentService', () => {
  let service: ConsentService;

  const mockPrismaService = {
    consent: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsentService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ConsentService>(ConsentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hasConsent', () => {
    it('should grant transactional consent by default if no opt-out record exists', async () => {
      mockPrismaService.consent.findFirst.mockResolvedValue(null);

      const hasConsent = await service.hasConsent(
        'business-uuid',
        'customer-uuid',
        'transactional',
        'whatsapp',
      );

      expect(hasConsent).toBe(true);
      expect(mockPrismaService.consent.findFirst).toHaveBeenCalledWith({
        where: {
          businessId: 'business-uuid',
          customerId: 'customer-uuid',
          consentType: ConsentType.DATA_PROCESSING,
          granted: false,
        },
      });
    });

    it('should deny transactional consent if opt-out record exists', async () => {
      mockPrismaService.consent.findFirst.mockResolvedValue({
        id: 'consent-uuid',
        granted: false,
      });

      const hasConsent = await service.hasConsent(
        'business-uuid',
        'customer-uuid',
        'transactional',
        'whatsapp',
      );

      expect(hasConsent).toBe(false);
    });

    it('should grant marketing consent if explicit opt-in record exists', async () => {
      mockPrismaService.consent.findFirst.mockResolvedValue({
        id: 'consent-uuid',
        granted: true,
      });

      const hasConsent = await service.hasConsent(
        'business-uuid',
        'customer-uuid',
        'marketing',
        'whatsapp',
      );

      expect(hasConsent).toBe(true);
      expect(mockPrismaService.consent.findFirst).toHaveBeenCalledWith({
        where: {
          businessId: 'business-uuid',
          customerId: 'customer-uuid',
          consentType: ConsentType.MARKETING_WHATSAPP,
          granted: true,
        },
      });
    });

    it('should deny marketing consent if explicit opt-in record does not exist', async () => {
      mockPrismaService.consent.findFirst.mockResolvedValue(null);

      const hasConsent = await service.hasConsent(
        'business-uuid',
        'customer-uuid',
        'marketing',
        'whatsapp',
      );

      expect(hasConsent).toBe(false);
    });
  });

  describe('updateConsent', () => {
    it('should update existing consent record if it exists', async () => {
      const existingConsent = {
        id: 'consent-uuid',
        businessId: 'business-uuid',
        customerId: 'customer-uuid',
        consentType: ConsentType.MARKETING_WHATSAPP,
        granted: false,
        grantedAt: new Date(),
      };
      mockPrismaService.consent.findFirst.mockResolvedValue(existingConsent);
      mockPrismaService.consent.update.mockResolvedValue({
        ...existingConsent,
        granted: true,
      });

      const result = await service.updateConsent(
        'business-uuid',
        'customer-uuid',
        ConsentType.MARKETING_WHATSAPP,
        true,
        ConsentSource.BOOKING_FORM,
      );

      expect(result.granted).toBe(true);
      expect(mockPrismaService.consent.update).toHaveBeenCalled();
    });

    it('should create new consent record if it does not exist', async () => {
      mockPrismaService.consent.findFirst.mockResolvedValue(null);
      mockPrismaService.consent.create.mockResolvedValue({
        id: 'new-consent-uuid',
        businessId: 'business-uuid',
        customerId: 'customer-uuid',
        consentType: ConsentType.MARKETING_WHATSAPP,
        granted: true,
      });

      const result = await service.updateConsent(
        'business-uuid',
        'customer-uuid',
        ConsentType.MARKETING_WHATSAPP,
        true,
        ConsentSource.BOOKING_FORM,
      );

      expect(result.id).toBe('new-consent-uuid');
      expect(mockPrismaService.consent.create).toHaveBeenCalled();
    });
  });
});
