/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';
import { PermissionsService } from '../permissions/permissions.service';
import {
  SystemComponentStatus,
  IncidentSeverity,
  IncidentStatus,
} from './dto/incidents.dto';

describe('AdminController', () => {
  let controller: AdminController;
  let service: AdminService;

  const mockAdminService = {
    getDashboardMetrics: jest.fn(),
    findAllBusinesses: jest.fn(),
    updateBusinessStatus: jest.fn(),
    extendTrial: jest.fn(),
    getSystemStatus: jest.fn(),
    updateSystemStatus: jest.fn(),
    createIncident: jest.fn(),
    updateIncident: jest.fn(),
    getIncidentMetrics: jest.fn(),
  };

  const mockPermissionsService = {
    getPermissionsForRole: jest.fn().mockResolvedValue([]),
  };

  const mockUserPayload: UserPayload = {
    userId: 'admin-1',
    email: 'admin@rozx.io',
    businessId: 'system-business',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: mockAdminService,
        },
        {
          provide: PermissionsService,
          useValue: mockPermissionsService,
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDashboard', () => {
    it('should call adminService.getDashboardMetrics', async () => {
      const mockResult = { mrr: 1000, arr: 12000 };
      mockAdminService.getDashboardMetrics.mockResolvedValue(mockResult);

      const result = await controller.getDashboard();
      expect(result).toBe(mockResult);
      expect(service.getDashboardMetrics).toHaveBeenCalled();
    });
  });

  describe('getBusinesses', () => {
    it('should call adminService.findAllBusinesses with defaults', async () => {
      const mockResult = { data: [], total: 0 };
      mockAdminService.findAllBusinesses.mockResolvedValue(mockResult);

      const result = await controller.getBusinesses(1, 10);
      expect(result).toBe(mockResult);
      expect(service.findAllBusinesses).toHaveBeenCalledWith(1, 10);
    });
  });

  describe('updateStatus', () => {
    it('should call adminService.updateBusinessStatus', async () => {
      const mockResult = { id: 'biz-1', status: 'SUSPENDED' };
      mockAdminService.updateBusinessStatus.mockResolvedValue(mockResult);

      const result = await controller.updateStatus(mockUserPayload, 'biz-1', {
        status: 'SUSPENDED',
      });
      expect(result).toBe(mockResult);
      expect(service.updateBusinessStatus).toHaveBeenCalledWith(
        'biz-1',
        'SUSPENDED',
        'admin-1',
      );
    });
  });

  describe('extendTrial', () => {
    it('should call adminService.extendTrial', async () => {
      const mockResult = { id: 'biz-1', trialEndsAt: new Date() };
      mockAdminService.extendTrial.mockResolvedValue(mockResult);

      const result = await controller.extendTrial(mockUserPayload, 'biz-1', {
        extensionDays: 15,
      });
      expect(result).toBe(mockResult);
      expect(service.extendTrial).toHaveBeenCalledWith('biz-1', 15, 'admin-1');
    });
  });

  describe('getSystemStatus', () => {
    it('should call adminService.getSystemStatus', async () => {
      const mockResult = [{ component: 'api', status: 'Operational' }];
      mockAdminService.getSystemStatus.mockResolvedValue(mockResult);

      const result = await controller.getSystemStatus();
      expect(result).toBe(mockResult);
      expect(service.getSystemStatus).toHaveBeenCalled();
    });
  });

  describe('updateSystemStatus', () => {
    it('should call adminService.updateSystemStatus', async () => {
      const mockResult = {
        component: 'api',
        status: SystemComponentStatus.DEGRADED,
      };
      mockAdminService.updateSystemStatus.mockResolvedValue(mockResult);

      const result = await controller.updateSystemStatus(
        mockUserPayload,
        'api',
        { status: SystemComponentStatus.DEGRADED },
      );
      expect(result).toBe(mockResult);
      expect(service.updateSystemStatus).toHaveBeenCalledWith(
        'api',
        { status: SystemComponentStatus.DEGRADED },
        'admin-1',
      );
    });
  });

  describe('createIncident', () => {
    it('should call adminService.createIncident', async () => {
      const dto = {
        title: 'DB Outage',
        severity: IncidentSeverity.P1,
        status: IncidentStatus.OPEN,
        startedAt: '2026-06-15T00:00:00Z',
      };
      const mockResult = { id: 'inc-1', ...dto };
      mockAdminService.createIncident.mockResolvedValue(mockResult);

      const result = await controller.createIncident(dto);
      expect(result).toBe(mockResult);
      expect(service.createIncident).toHaveBeenCalledWith(dto);
    });
  });

  describe('updateIncident', () => {
    it('should call adminService.updateIncident', async () => {
      const dto = {
        status: IncidentStatus.RESOLVED,
        resolvedAt: '2026-06-15T01:00:00Z',
        cSatScore: 90,
      };
      const mockResult = { id: 'inc-1', ...dto };
      mockAdminService.updateIncident.mockResolvedValue(mockResult);

      const result = await controller.updateIncident('inc-1', dto);
      expect(result).toBe(mockResult);
      expect(service.updateIncident).toHaveBeenCalledWith('inc-1', dto);
    });
  });

  describe('getIncidentMetrics', () => {
    it('should call adminService.getIncidentMetrics', async () => {
      const mockResult = [{ month: '2026-06', resolvedCount: 5 }];
      mockAdminService.getIncidentMetrics.mockResolvedValue(mockResult);

      const result = await controller.getIncidentMetrics();
      expect(result).toBe(mockResult);
      expect(service.getIncidentMetrics).toHaveBeenCalled();
    });
  });
});
