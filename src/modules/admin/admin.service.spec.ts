/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  SystemStatusType,
  IncidentStatus,
  IncidentSeverity,
} from '../../generated/prisma';

describe('AdminService', () => {
  let service: AdminService;

  const mockPrismaService = {
    subscription: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    business: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    systemStatus: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    incident: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboardMetrics', () => {
    it('should calculate MRR, ARR, ARPU, Churn, and Growth correctly', async () => {
      // Mock subscriptions (one monthly, one yearly)
      mockPrismaService.subscription.findMany.mockResolvedValue([
        { amount: 1000, billingInterval: 'monthly', status: 'ACTIVE' },
        { amount: 12000, billingInterval: 'yearly', status: 'ACTIVE' },
      ]);

      // Mock business counts
      mockPrismaService.business.count
        .mockResolvedValueOnce(2) // activeCount
        .mockResolvedValueOnce(3) // trialCount
        .mockResolvedValueOnce(1) // suspendedCount
        .mockResolvedValueOnce(1); // cancelledCount (churn)

      // Mock new subscriptions in past 30 days
      mockPrismaService.subscription.count.mockResolvedValue(2);

      // Mock audit logs for upgrades/downgrades
      mockPrismaService.auditLog.findMany.mockResolvedValue([
        { metadata: { transition: 'upgrade' } },
        { metadata: { transition: 'upgrade' } },
        { metadata: { transition: 'downgrade' } },
        { metadata: { transition: 'renew' } },
      ]);

      const result = await service.getDashboardMetrics();

      // MRR: 1000 + (12000 / 12) = 2000
      expect(result.mrr).toBe(2000);
      // ARR: 2000 * 12 = 24000
      expect(result.arr).toBe(24000);
      // ARPU: 2000 / 2 = 1000
      expect(result.arpu).toBe(1000);
      // Churn: (1 / 2) * 100 = 50%
      expect(result.churnRate).toBe(50);
      // Business counts
      expect(result.businesses).toEqual({
        active: 2,
        trial: 3,
        suspended: 1,
        total: 6,
      });
      // Growth metrics
      expect(result.growth).toEqual({
        newSubscriptions: 2,
        upgrades: 2,
        downgrades: 1,
        renewals: 1,
        cancellations: 1,
      });
    });
  });

  describe('updateBusinessStatus', () => {
    it('should successfully update business status and write audit log', async () => {
      mockPrismaService.business.findUnique.mockResolvedValue({ id: 'biz-1' });
      mockPrismaService.business.update.mockResolvedValue({
        id: 'biz-1',
        status: 'SUSPENDED',
      });

      const result = await service.updateBusinessStatus(
        'biz-1',
        'SUSPENDED',
        'admin-1',
      );

      expect(result.status).toBe('SUSPENDED');
      expect(mockPrismaService.business.update).toHaveBeenCalledWith({
        where: { id: 'biz-1' },
        data: { status: 'SUSPENDED', version: { increment: 1 } },
      });
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessId: 'biz-1',
            userId: 'admin-1',
            action: 'UPDATE',
            entity: 'Business',
          }),
        }),
      );
    });

    it('should throw NotFoundException if business is not found', async () => {
      mockPrismaService.business.findUnique.mockResolvedValue(null);

      await expect(
        service.updateBusinessStatus('biz-1', 'SUSPENDED', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('extendTrial', () => {
    it('should extend trial EndsAt date', async () => {
      const initialDate = new Date('2026-06-15T00:00:00Z');
      mockPrismaService.business.findUnique.mockResolvedValue({
        id: 'biz-1',
        trialEndsAt: initialDate,
      });
      mockPrismaService.business.update.mockResolvedValue({ id: 'biz-1' });

      await service.extendTrial('biz-1', 10, 'admin-1');

      const expectedDate = new Date(initialDate);
      expectedDate.setDate(expectedDate.getDate() + 10);

      expect(mockPrismaService.business.update).toHaveBeenCalledWith({
        where: { id: 'biz-1' },
        data: {
          trialEndsAt: expectedDate,
          version: { increment: 1 },
        },
      });
    });
  });

  describe('getSystemStatus', () => {
    it('should return system statuses in component order, filling defaults if not in DB', async () => {
      mockPrismaService.systemStatus.findMany.mockResolvedValue([
        { component: 'payments', status: SystemStatusType.DEGRADED },
        { component: 'api', status: SystemStatusType.OPERATIONAL },
      ]);

      const result = await service.getSystemStatus();

      expect(result).toHaveLength(6);
      expect(result.find((r) => r.component === 'payments')?.status).toBe(
        SystemStatusType.DEGRADED,
      );
      expect(result.find((r) => r.component === 'booking_engine')?.status).toBe(
        SystemStatusType.OPERATIONAL,
      );
    });
  });

  describe('updateSystemStatus', () => {
    it('should upsert component status', async () => {
      mockPrismaService.systemStatus.upsert.mockResolvedValue({
        component: 'api',
        status: SystemStatusType.MAINTENANCE,
      });

      const result = await service.updateSystemStatus(
        'api',
        { status: SystemStatusType.MAINTENANCE },
        'admin-1',
      );

      expect(result.status).toBe(SystemStatusType.MAINTENANCE);
      expect(mockPrismaService.systemStatus.upsert).toHaveBeenCalledWith({
        where: { component: 'api' },
        update: { status: SystemStatusType.MAINTENANCE, updatedBy: 'admin-1' },
        create: {
          component: 'api',
          status: SystemStatusType.MAINTENANCE,
          updatedBy: 'admin-1',
        },
      });
    });
  });

  describe('incident management', () => {
    it('should create a new incident', async () => {
      const dto = {
        severity: IncidentSeverity.P1,
        status: IncidentStatus.OPEN,
        title: 'API Outage',
        startedAt: '2026-06-15T00:00:00Z',
      };
      mockPrismaService.incident.create.mockResolvedValue({
        id: 'inc-1',
        ...dto,
      });

      const result = await service.createIncident(dto);

      expect(result.id).toBe('inc-1');
      expect(mockPrismaService.incident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          severity: IncidentSeverity.P1,
          status: IncidentStatus.OPEN,
          title: 'API Outage',
        }),
      });
    });

    it('should update incident and auto calculate resolutionTimeMs if resolved', async () => {
      const startedAt = new Date('2026-06-15T08:00:00Z');
      const resolvedAt = new Date('2026-06-15T10:00:00Z');

      mockPrismaService.incident.findUnique.mockResolvedValue({
        id: 'inc-1',
        startedAt,
        resolvedAt: null,
        status: IncidentStatus.OPEN,
      });
      mockPrismaService.incident.update.mockResolvedValue({ id: 'inc-1' });

      await service.updateIncident('inc-1', {
        status: IncidentStatus.RESOLVED,
        resolvedAt: resolvedAt.toISOString(),
      });

      expect(mockPrismaService.incident.update).toHaveBeenCalledWith({
        where: { id: 'inc-1' },
        data: expect.objectContaining({
          status: IncidentStatus.RESOLVED,
          resolvedAt,
          resolutionTimeMs: 2 * 60 * 60 * 1000, // 2 hours in ms
        }),
      });
    });
  });

  describe('getIncidentMetrics', () => {
    it('should group incidents by month and calculate averages', async () => {
      // 2 resolved incidents in 2026-06:
      // Inc 1: responseTime = 10min, resolutionTime = 120min (2 hours), CSAT = 95
      // Inc 2: responseTime = 20min, resolutionTime = 240min (4 hours), CSAT = 85
      // Average resolutionTime = 3 hours (180 mins) -> target met (<=4h)
      // Average CSAT = 90% -> target met (>=90%)
      const started1 = new Date('2026-06-15T08:00:00Z');
      const started2 = new Date('2026-06-20T08:00:00Z');

      mockPrismaService.incident.findMany.mockResolvedValue([
        {
          startedAt: started1,
          severity: IncidentSeverity.P1,
          status: IncidentStatus.RESOLVED,
          isRepeat: false,
          responseTimeMs: 10 * 60 * 1000,
          resolutionTimeMs: 120 * 60 * 1000,
          cSatScore: 95,
        },
        {
          startedAt: started2,
          severity: IncidentSeverity.P2,
          status: IncidentStatus.RESOLVED,
          isRepeat: true,
          responseTimeMs: 20 * 60 * 1000,
          resolutionTimeMs: 240 * 60 * 1000,
          cSatScore: 85,
        },
      ]);

      const result = await service.getIncidentMetrics();

      expect(result).toHaveLength(1);
      expect(result[0].month).toBe('2026-06');
      expect(result[0].p1Count).toBe(1);
      expect(result[0].p2Count).toBe(1);
      expect(result[0].resolvedCount).toBe(2);
      expect(result[0].repeatCount).toBe(1);
      expect(result[0].avgResponseTimeMins).toBe(15);
      expect(result[0].avgResolutionTimeMins).toBe(180);
      expect(result[0].avgCSatScore).toBe(90);
      expect(result[0].targets).toEqual({
        p1MttrTargetMet: true,
        p2MttrTargetMet: true,
        cSatTargetMet: true,
      });
    });
  });
});
