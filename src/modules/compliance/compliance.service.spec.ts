/* eslint-disable @typescript-eslint/no-unsafe-assignment */
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceService } from './compliance.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentService } from '../notifications/consent.service';
import { StorageService } from '../storage/storage.service';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConsentType, ConsentSource } from '../../generated/prisma';

describe('ComplianceService', () => {
  let service: ComplianceService;

  const customerFindFirst = jest.fn();
  const customerUpdate = jest.fn();
  const customerUpdateMany = jest.fn();
  const consentFindMany = jest.fn();
  const consentUpdateMany = jest.fn();
  const consentDeleteMany = jest.fn();
  const auditLogCreate = jest.fn();
  const dataDeletionRequestCreate = jest.fn();
  const dataDeletionRequestFindFirst = jest.fn();
  const dataDeletionRequestFindMany = jest.fn();
  const dataDeletionRequestUpdate = jest.fn();
  const dataDeletionRequestDeleteMany = jest.fn();
  const appointmentUpdateMany = jest.fn();
  const appointmentDeleteMany = jest.fn();
  const subscriptionFindMany = jest.fn();
  const leaveDeleteMany = jest.fn();
  const reviewDeleteMany = jest.fn();
  const campaignDeleteMany = jest.fn();
  const packageDeleteMany = jest.fn();
  const membershipDeleteMany = jest.fn();
  const inventoryDeleteMany = jest.fn();
  const mediaAssetDeleteMany = jest.fn();
  const staffServiceDeleteMany = jest.fn();
  const staffDeleteMany = jest.fn();
  const domainDeleteMany = jest.fn();
  const pageDeleteMany = jest.fn();
  const websiteVersionDeleteMany = jest.fn();
  const websiteDeleteMany = jest.fn();
  const themeDeleteMany = jest.fn();
  const serviceDeleteMany = jest.fn();
  const serviceCategoryDeleteMany = jest.fn();
  const branchDeleteMany = jest.fn();
  const businessUpdate = jest.fn();

  const mockPrisma = {
    customer: {
      findFirst: customerFindFirst,
      update: customerUpdate,
      updateMany: customerUpdateMany,
    },
    consent: {
      findMany: consentFindMany,
      updateMany: consentUpdateMany,
      deleteMany: consentDeleteMany,
    },
    auditLog: {
      create: auditLogCreate,
    },
    dataDeletionRequest: {
      create: dataDeletionRequestCreate,
      findFirst: dataDeletionRequestFindFirst,
      findMany: dataDeletionRequestFindMany,
      update: dataDeletionRequestUpdate,
      deleteMany: dataDeletionRequestDeleteMany,
    },
    appointment: {
      updateMany: appointmentUpdateMany,
      deleteMany: appointmentDeleteMany,
    },
    subscription: {
      findMany: subscriptionFindMany,
    },
    leave: { deleteMany: leaveDeleteMany },
    review: { deleteMany: reviewDeleteMany },
    campaign: { deleteMany: campaignDeleteMany },
    package: { deleteMany: packageDeleteMany },
    membership: { deleteMany: membershipDeleteMany },
    inventory: { deleteMany: inventoryDeleteMany },
    mediaAsset: { deleteMany: mediaAssetDeleteMany },
    staffService: { deleteMany: staffServiceDeleteMany },
    staff: { deleteMany: staffDeleteMany },
    domain: { deleteMany: domainDeleteMany },
    page: { deleteMany: pageDeleteMany },
    websiteVersion: { deleteMany: websiteVersionDeleteMany },
    website: { deleteMany: websiteDeleteMany },
    theme: { deleteMany: themeDeleteMany },
    service: { deleteMany: serviceDeleteMany },
    serviceCategory: { deleteMany: serviceCategoryDeleteMany },
    branch: { deleteMany: branchDeleteMany },
    business: { update: businessUpdate },
    $transaction: jest.fn(),
  };

  const mockConsentService = {
    updateConsent: jest.fn(),
  };

  const mockStorageService = {
    uploadFile: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      if (typeof arg === 'function') {
        const cb = arg as (tx: typeof mockPrisma) => Promise<unknown>;
        return cb(mockPrisma);
      }
      return arg;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConsentService, useValue: mockConsentService },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<ComplianceService>(ComplianceService);

    jest.clearAllMocks();
  });

  const businessId = 'business-uuid';
  const customerId = 'customer-uuid';
  const userId = 'user-uuid';

  describe('getConsents', () => {
    it('should return consents successfully', async () => {
      customerFindFirst.mockResolvedValue({ id: customerId });
      const mockConsents = [{ id: 'consent-1' }];
      consentFindMany.mockResolvedValue(mockConsents);

      const result = await service.getConsents(businessId, customerId);

      expect(result).toEqual(mockConsents);
      expect(customerFindFirst).toHaveBeenCalledWith({
        where: { id: customerId, businessId, deletedAt: null },
      });
      expect(consentFindMany).toHaveBeenCalledWith({
        where: { businessId, customerId },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should throw NotFoundException if customer not found', async () => {
      customerFindFirst.mockResolvedValue(null);

      await expect(service.getConsents(businessId, customerId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateConsent', () => {
    it('should update consent successfully', async () => {
      customerFindFirst.mockResolvedValue({ id: customerId });
      const mockConsent = {
        id: 'consent-1',
        consentType: 'marketing_whatsapp',
      };
      mockConsentService.updateConsent.mockResolvedValue(mockConsent);
      auditLogCreate.mockResolvedValue({});

      const result = await service.updateConsent(
        businessId,
        customerId,
        ConsentType.MARKETING_WHATSAPP,
        true,
        ConsentSource.BOOKING_FORM,
      );

      expect(result).toEqual(mockConsent);
      expect(mockConsentService.updateConsent).toHaveBeenCalledWith(
        businessId,
        customerId,
        ConsentType.MARKETING_WHATSAPP,
        true,
        ConsentSource.BOOKING_FORM,
      );
      expect(auditLogCreate).toHaveBeenCalled();
    });
  });

  describe('exportCustomerData', () => {
    it('should aggregate customer data, upload to storage, and return URL', async () => {
      const mockCustomer = {
        id: customerId,
        name: 'John Doe',
        phone: '+919876543210',
        email: 'john@example.com',
        consents: [{ consentType: 'marketing_whatsapp', granted: true }],
        appointments: [
          {
            id: 'appt-1',
            startTime: new Date(),
            endTime: new Date(),
            status: 'CONFIRMED',
            service: { name: 'Haircut', price: 50000 },
            payments: [],
          },
        ],
        notifications: [],
      };
      customerFindFirst.mockResolvedValue(mockCustomer);
      mockStorageService.uploadFile.mockResolvedValue(
        'https://cdn.rozx.in/mock-export.json',
      );
      auditLogCreate.mockResolvedValue({});

      const result = await service.exportCustomerData(
        businessId,
        customerId,
        userId,
      );

      expect(result).toEqual({
        fileUrl: 'https://cdn.rozx.in/mock-export.json',
      });
      expect(mockStorageService.uploadFile).toHaveBeenCalled();
      expect(auditLogCreate).toHaveBeenCalled();
    });
  });

  describe('requestDeletion', () => {
    it('should create a deletion request successfully', async () => {
      customerFindFirst.mockResolvedValue({ id: customerId });
      dataDeletionRequestFindFirst.mockResolvedValue(null);
      const mockRequest = { id: 'req-1', status: 'PENDING' };
      dataDeletionRequestCreate.mockResolvedValue(mockRequest);

      const result = await service.requestDeletion(businessId, customerId);

      expect(result).toEqual(mockRequest);
      expect(dataDeletionRequestCreate).toHaveBeenCalledWith({
        data: {
          businessId,
          customerId,
          status: 'PENDING',
          scheduledAt: expect.any(Date),
        },
      });
    });

    it('should throw ConflictException if request already pending', async () => {
      customerFindFirst.mockResolvedValue({ id: customerId });
      dataDeletionRequestFindFirst.mockResolvedValue({ id: 'req-1' });

      await expect(
        service.requestDeletion(businessId, customerId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cancelDeletionRequest', () => {
    it('should set status to CANCELLED', async () => {
      dataDeletionRequestFindFirst.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING',
      });
      dataDeletionRequestUpdate.mockResolvedValue({
        id: 'req-1',
        status: 'CANCELLED',
      });

      const result = await service.cancelDeletionRequest(businessId, 'req-1');

      expect(result.status).toBe('CANCELLED');
    });

    it('should throw BadRequestException if status is not PENDING', async () => {
      dataDeletionRequestFindFirst.mockResolvedValue({
        id: 'req-1',
        status: 'PROCESSED',
      });

      await expect(
        service.cancelDeletionRequest(businessId, 'req-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('executeDeletionRequest', () => {
    it('should execute anonymization immediately', async () => {
      dataDeletionRequestFindFirst.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING',
        customerId,
      });
      customerFindFirst.mockResolvedValue({ id: customerId });
      customerUpdate.mockResolvedValue({});
      consentUpdateMany.mockResolvedValue({});
      appointmentUpdateMany.mockResolvedValue({});
      dataDeletionRequestUpdate.mockResolvedValue({
        id: 'req-1',
        status: 'PROCESSED',
      });

      const result = await service.executeDeletionRequest(
        businessId,
        'req-1',
        userId,
      );

      expect(result.status).toBe('PROCESSED');
      expect(customerUpdate).toHaveBeenCalledWith({
        where: { id: customerId },
        data: {
          name: 'Anonymized Customer',
          phone: expect.stringContaining('anonymized'),
          email: null,
          gender: null,
          birthday: null,
          notes: null,
          deletedAt: expect.any(Date),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
    });
  });

  describe('executeScheduledDeletions', () => {
    it('should execute deletions that reached schedule date', async () => {
      dataDeletionRequestFindMany.mockResolvedValue([
        { id: 'req-1', businessId, customerId },
      ]);
      customerFindFirst.mockResolvedValue({ id: customerId });
      customerUpdate.mockResolvedValue({});
      consentUpdateMany.mockResolvedValue({});
      appointmentUpdateMany.mockResolvedValue({});
      dataDeletionRequestUpdate.mockResolvedValue({});

      const result = await service.executeScheduledDeletions();

      expect(result).toEqual({ processed: 1 });
    });
  });

  describe('runRetentionCleanup', () => {
    it('should run retention cleanup for cancelled businesses', async () => {
      subscriptionFindMany.mockResolvedValue([{ businessId }]);
      consentDeleteMany.mockResolvedValue({});
      dataDeletionRequestDeleteMany.mockResolvedValue({});
      customerUpdateMany.mockResolvedValue({});
      appointmentUpdateMany.mockResolvedValue({});
      leaveDeleteMany.mockResolvedValue({});
      reviewDeleteMany.mockResolvedValue({});
      campaignDeleteMany.mockResolvedValue({});
      packageDeleteMany.mockResolvedValue({});
      membershipDeleteMany.mockResolvedValue({});
      inventoryDeleteMany.mockResolvedValue({});
      mediaAssetDeleteMany.mockResolvedValue({});
      staffServiceDeleteMany.mockResolvedValue({});
      staffDeleteMany.mockResolvedValue({});
      domainDeleteMany.mockResolvedValue({});
      pageDeleteMany.mockResolvedValue({});
      websiteVersionDeleteMany.mockResolvedValue({});
      websiteDeleteMany.mockResolvedValue({});
      themeDeleteMany.mockResolvedValue({});
      serviceDeleteMany.mockResolvedValue({});
      serviceCategoryDeleteMany.mockResolvedValue({});
      branchDeleteMany.mockResolvedValue({});
      businessUpdate.mockResolvedValue({});

      const result = await service.runRetentionCleanup();

      expect(result).toEqual({ cleanedUp: 1 });
      expect(businessUpdate).toHaveBeenCalledWith({
        where: { id: businessId },
        data: {
          name: 'Archived Business',
          slug: expect.stringContaining('archived-slug'),
          phone: null,
          email: null,
          description: null,
          logoUrl: null,
          status: 'SUSPENDED',
          deletedAt: expect.any(Date),
        },
      });
    });
  });
});
