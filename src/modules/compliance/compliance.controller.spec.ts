/* eslint-disable @typescript-eslint/unbound-method */
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { PermissionsService } from '../permissions/permissions.service';
import { BadRequestException } from '@nestjs/common';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';
import { ConsentType, ConsentSource } from '../../generated/prisma';

describe('ComplianceController', () => {
  let controller: ComplianceController;
  let service: ComplianceService;

  const mockComplianceService = {
    getConsents: jest.fn(),
    updateConsent: jest.fn(),
    exportCustomerData: jest.fn(),
    requestDeletion: jest.fn(),
    cancelDeletionRequest: jest.fn(),
    executeDeletionRequest: jest.fn(),
  };

  const mockPermissionsService = {
    getPermissionsForRole: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ComplianceController],
      providers: [
        { provide: ComplianceService, useValue: mockComplianceService },
        { provide: PermissionsService, useValue: mockPermissionsService },
      ],
    }).compile();

    controller = module.get<ComplianceController>(ComplianceController);
    service = module.get<ComplianceService>(ComplianceService);

    jest.clearAllMocks();
  });

  const mockUser: UserPayload = {
    userId: 'user-uuid',
    email: 'test@example.com',
    businessId: 'business-uuid',
    memberId: 'member-uuid',
    roleId: 'role-uuid',
  };

  const customerId = 'customer-uuid';
  const requestId = 'request-uuid';

  describe('getConsents', () => {
    it('should call getConsents on service', async () => {
      mockComplianceService.getConsents.mockResolvedValue([]);
      const result = await controller.getConsents(mockUser, customerId);
      expect(result).toEqual([]);
      expect(service.getConsents).toHaveBeenCalledWith(
        mockUser.businessId,
        customerId,
      );
    });

    it('should throw BadRequestException if businessId is missing', async () => {
      const userWithoutBiz = { ...mockUser, businessId: undefined };
      await expect(
        controller.getConsents(userWithoutBiz, customerId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateConsent', () => {
    it('should call updateConsent on service', async () => {
      const dto = {
        consentType: ConsentType.MARKETING_WHATSAPP,
        granted: true,
        source: ConsentSource.MANUAL,
      };
      mockComplianceService.updateConsent.mockResolvedValue({});
      await controller.updateConsent(mockUser, customerId, dto);
      expect(service.updateConsent).toHaveBeenCalledWith(
        mockUser.businessId,
        customerId,
        dto.consentType,
        dto.granted,
        dto.source,
      );
    });
  });

  describe('exportCustomerData', () => {
    it('should call exportCustomerData on service', async () => {
      mockComplianceService.exportCustomerData.mockResolvedValue({
        fileUrl: 'url',
      });
      const result = await controller.exportCustomerData(mockUser, customerId);
      expect(result).toEqual({ fileUrl: 'url' });
      expect(service.exportCustomerData).toHaveBeenCalledWith(
        mockUser.businessId,
        customerId,
        mockUser.userId,
      );
    });
  });

  describe('requestDeletion', () => {
    it('should call requestDeletion on service', async () => {
      mockComplianceService.requestDeletion.mockResolvedValue({});
      await controller.requestDeletion(mockUser, customerId);
      expect(service.requestDeletion).toHaveBeenCalledWith(
        mockUser.businessId,
        customerId,
      );
    });
  });

  describe('cancelDeletionRequest', () => {
    it('should call cancelDeletionRequest on service', async () => {
      mockComplianceService.cancelDeletionRequest.mockResolvedValue({});
      await controller.cancelDeletionRequest(mockUser, requestId);
      expect(service.cancelDeletionRequest).toHaveBeenCalledWith(
        mockUser.businessId,
        requestId,
      );
    });
  });

  describe('executeDeletionRequest', () => {
    it('should call executeDeletionRequest on service', async () => {
      mockComplianceService.executeDeletionRequest.mockResolvedValue({});
      await controller.executeDeletionRequest(mockUser, requestId);
      expect(service.executeDeletionRequest).toHaveBeenCalledWith(
        mockUser.businessId,
        requestId,
        mockUser.userId,
      );
    });
  });
});
