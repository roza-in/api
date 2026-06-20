/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const paymentAggregate = jest.fn();
  const refundAggregate = jest.fn();
  const appointmentCount = jest.fn();
  const appointmentFindMany = jest.fn();
  const appointmentGroupBy = jest.fn();
  const customerCount = jest.fn();
  const customerFindMany = jest.fn();
  const staffFindMany = jest.fn();
  const staffFindFirst = jest.fn();
  const leaveFindMany = jest.fn();
  const campaignFindMany = jest.fn();
  const queryRawUnsafe = jest.fn();

  const mockPrisma = {
    payment: {
      aggregate: paymentAggregate,
    },
    refund: {
      aggregate: refundAggregate,
    },
    appointment: {
      count: appointmentCount,
      findMany: appointmentFindMany,
      groupBy: appointmentGroupBy,
    },
    customer: {
      count: customerCount,
      findMany: customerFindMany,
    },
    staff: {
      findMany: staffFindMany,
      findFirst: staffFindFirst,
    },
    leave: {
      findMany: leaveFindMany,
    },
    campaign: {
      findMany: campaignFindMany,
    },
    $queryRawUnsafe: queryRawUnsafe,
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    jest.clearAllMocks();
  });

  const businessId = 'business-uuid';

  describe('parseDates', () => {
    it('should default to last 30 days if no parameters are provided', () => {
      const { start, end, days } = service.parseDates({});
      expect(start).toBeInstanceOf(Date);
      expect(end).toBeInstanceOf(Date);
      expect(days).toEqual(30);
    });

    it('should parse provided dates successfully', () => {
      const { start, end, days } = service.parseDates({
        startDate: '2026-06-01',
        endDate: '2026-06-10',
      });
      expect(start.getDate()).toEqual(1);
      expect(end.getDate()).toEqual(10);
      expect(days).toEqual(10);
    });

    it('should throw BadRequestException if start date is after end date', () => {
      expect(() =>
        service.parseDates({ startDate: '2026-06-10', endDate: '2026-06-01' }),
      ).toThrow(BadRequestException);
    });
  });

  describe('getNetRevenue', () => {
    it('should calculate gross, refunds, and net revenue', async () => {
      paymentAggregate.mockResolvedValue({ _sum: { amount: 1000 } });
      refundAggregate.mockResolvedValue({ _sum: { amount: 200 } });

      const result = await service.getNetRevenue(
        businessId,
        new Date('2026-06-01'),
        new Date('2026-06-10'),
      );

      expect(result).toEqual({ gross: 1000, refunds: 200, net: 800 });
      expect(paymentAggregate).toHaveBeenCalledWith({
        where: {
          businessId,
          status: 'SUCCESS',
          createdAt: { gte: expect.any(Date), lte: expect.any(Date) },
        },
        _sum: { amount: true },
      });
      expect(refundAggregate).toHaveBeenCalledWith({
        where: {
          businessId,
          status: 'PROCESSED',
          createdAt: { gte: expect.any(Date), lte: expect.any(Date) },
        },
        _sum: { amount: true },
      });
    });
  });

  describe('getAppointmentMetrics', () => {
    it('should calculate totals and rates for appointments', async () => {
      appointmentFindMany.mockResolvedValue([
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
        { status: 'CANCELLED' },
        { status: 'NO_SHOW' },
      ]);

      const result = await service.getAppointmentMetrics(
        businessId,
        new Date('2026-06-01'),
        new Date('2026-06-10'),
        10,
      );

      expect(result).toEqual({
        total: 4,
        completed: 2,
        cancelled: 1,
        noShow: 1,
        cancellationRate: 25,
        noShowRate: 25,
        avgPerDay: 0.2,
      });
    });
  });

  describe('getCustomerMetrics', () => {
    it('should calculate customer count and repeat customer metrics', async () => {
      customerCount.mockResolvedValueOnce(50); // total active
      customerCount.mockResolvedValueOnce(10); // new
      appointmentFindMany.mockResolvedValue([
        { customerId: 'cust-1' },
        { customerId: 'cust-2' },
        { customerId: 'cust-1' },
      ]); // completed in period
      appointmentGroupBy.mockResolvedValue([
        { customerId: 'cust-1', _count: { id: 2 } },
        { customerId: 'cust-2', _count: { id: 1 } },
      ]); // historical counts
      paymentAggregate.mockResolvedValue({ _sum: { amount: 5000 } });

      const result = await service.getCustomerMetrics(
        businessId,
        new Date('2026-06-01'),
        new Date('2026-06-10'),
      );

      expect(result).toEqual({
        totalCustomers: 50,
        newCustomers: 10,
        returningCustomers: 1,
        repeatRate: 50, // 1 returning / 2 unique customers * 100
        clv: 100, // 5000 / 50 total active
      });
    });
  });

  describe('getStaffCapacityMinutes', () => {
    const mockStaff = {
      id: 'staff-1',
      workingHours: {
        monday: { open: '10:00', close: '18:00' }, // 480 mins
        tuesday: { open: '10:00', close: '18:00' }, // 480 mins
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
    };

    it('should calculate capacities and subtract overlapping leaves', () => {
      // June 1 2026 is a Monday. June 2 2026 is a Tuesday.
      // Leave overlaps the Monday shift for 2 hours (120 minutes)
      const leaveStart = new Date('2026-06-01');
      leaveStart.setHours(12, 0, 0, 0);
      const leaveEnd = new Date('2026-06-01');
      leaveEnd.setHours(14, 0, 0, 0);

      const leaves = [
        {
          staffId: 'staff-1',
          startTime: leaveStart,
          endTime: leaveEnd,
        },
      ];

      const start = new Date('2026-06-01T00:00:00.000Z');
      const end = new Date('2026-06-02T23:59:59.999Z');

      const result = service.getStaffCapacityMinutes(
        mockStaff,
        start,
        end,
        leaves,
      );

      // Expected: Monday (480 - 120 = 360) + Tuesday (480) = 840 minutes
      expect(result).toEqual(840);
    });
  });

  describe('getStaffMetrics', () => {
    it('should retrieve overall and individual staff metrics', async () => {
      staffFindMany.mockResolvedValue([
        {
          id: 'staff-1',
          name: 'Staff 1',
          workingHours: {
            monday: { open: '10:00', close: '18:00' },
            tuesday: null,
            wednesday: null,
            thursday: null,
            friday: null,
            saturday: null,
            sunday: null,
          },
        },
      ]);
      appointmentFindMany.mockResolvedValue([
        { staffId: 'staff-1', status: 'COMPLETED', service: { duration: 60 } },
      ]);
      leaveFindMany.mockResolvedValue([]);

      const result = await service.getStaffMetrics(
        businessId,
        new Date('2026-06-01'), // Monday
        new Date('2026-06-01'),
      );

      expect(result.overallUtilization).toEqual(12.5); // 60 mins booked / 480 capacity * 100
      expect(result.activeStaffCount).toEqual(1);
      expect(result.staffList[0]).toEqual({
        staffId: 'staff-1',
        name: 'Staff 1',
        bookedMinutes: 60,
        capacityMinutes: 480,
        utilization: 12.5,
        completedAppointments: 1,
      });
    });
  });

  describe('getMarketingMetrics', () => {
    it('should retrieve campaign performance', async () => {
      campaignFindMany.mockResolvedValue([
        {
          sentCount: 100,
          deliveredCount: 90,
          clickCount: 10,
          revenueAttributed: 1500,
        },
      ]);

      const result = await service.getMarketingMetrics(
        businessId,
        new Date('2026-06-01'),
        new Date('2026-06-10'),
      );

      expect(result).toEqual({
        sentCount: 100,
        deliveredCount: 90,
        clickCount: 10,
        deliveryRate: 90,
        ctr: 11.11111111111111,
        campaignRevenue: 1500,
      });
    });
  });

  describe('getGrowthMetrics', () => {
    it('should calculate growth rates compared to previous month and daily trends', async () => {
      // Mock getNetRevenue (called multiple times for current, prev, yesterday)
      paymentAggregate.mockResolvedValue({ _sum: { amount: 1000 } });
      refundAggregate.mockResolvedValue({ _sum: { amount: 0 } });
      customerCount.mockResolvedValue(10); // current new / prev new / prev total
      appointmentCount.mockResolvedValue(5); // same weekday last week

      const result = await service.getGrowthMetrics(businessId, 800, 8);
      expect(result).toHaveProperty('monthlyRevenueGrowth');
      expect(result).toHaveProperty('customerGrowth');
      expect(result).toHaveProperty('todayRevenueGrowth');
      expect(result).toHaveProperty('todayAppointmentsGrowth');
    });
  });

  describe('getOwnerDashboard', () => {
    it('should fetch and return cached owner data if present', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ cached: true }));

      const result = await service.getOwnerDashboard(businessId, {});
      expect(result).toEqual({ cached: true });
      expect(mockRedis.get).toHaveBeenCalled();
    });

    it('should calculate fresh metrics if bypassCache or not cached', async () => {
      mockRedis.get.mockResolvedValue(null);
      paymentAggregate.mockResolvedValue({ _sum: { amount: 1000 } });
      refundAggregate.mockResolvedValue({ _sum: { amount: 100 } });
      appointmentCount.mockResolvedValue(5);
      appointmentFindMany.mockResolvedValue([]);
      appointmentGroupBy.mockResolvedValue([]);
      customerCount.mockResolvedValue(10);
      staffFindMany.mockResolvedValue([]);
      leaveFindMany.mockResolvedValue([]);
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.getOwnerDashboard(businessId, {}, true);

      expect(result).toHaveProperty('today');
      expect(result).toHaveProperty('growth');
      expect(result).toHaveProperty('revenue');
      expect(mockRedis.set).toHaveBeenCalled();
    });
  });

  describe('getManagerDashboard', () => {
    it('should retrieve manager metrics and schedules', async () => {
      mockRedis.get.mockResolvedValue(null);
      staffFindMany.mockResolvedValue([]);
      appointmentFindMany.mockResolvedValue([]);
      paymentAggregate.mockResolvedValue({
        _sum: { amount: 500 },
        _count: { id: 2 },
      });
      queryRawUnsafe.mockResolvedValue([]);

      const result = await service.getManagerDashboard(businessId, {}, true);
      expect(result).toHaveProperty('todayAppointments');
      expect(result).toHaveProperty('activeStaff');
      expect(result).toHaveProperty('pendingPayments');
      expect(result).toHaveProperty('customerFollowUps');
    });
  });

  describe('getReceptionDashboard', () => {
    it('should retrieve reception real-time check-ins and collections', async () => {
      mockRedis.get.mockResolvedValue(null);
      appointmentFindMany.mockResolvedValue([]);
      paymentAggregate.mockResolvedValue({
        _sum: { amount: 1000 },
        _count: { id: 3 },
      });

      const result = await service.getReceptionDashboard(businessId, {}, true);
      expect(result).toHaveProperty('calendar');
      expect(result).toHaveProperty('upcoming');
      expect(result).toHaveProperty('checkInQueue');
      expect(result).toHaveProperty('pendingCollection');
    });
  });

  describe('getProfessionalDashboard', () => {
    it('should throw ForbiddenException if user has no staff link', async () => {
      staffFindFirst.mockResolvedValue(null);
      await expect(
        service.getProfessionalDashboard(businessId, 'member-1', {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should retrieve staff performance and schedule', async () => {
      staffFindFirst.mockResolvedValue({
        id: 'staff-1',
        workingHours: {},
        isActive: true,
      });
      mockRedis.get.mockResolvedValue(null);
      appointmentFindMany.mockResolvedValue([]);
      leaveFindMany.mockResolvedValue([]);
      paymentAggregate.mockResolvedValue({ _sum: { amount: 300 } });

      const result = await service.getProfessionalDashboard(
        businessId,
        'member-1',
        {},
        true,
      );
      expect(result).toHaveProperty('todayAppointments');
      expect(result).toHaveProperty('performance');
    });
  });
});
