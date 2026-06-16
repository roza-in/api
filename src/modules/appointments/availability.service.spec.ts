import { Test, TestingModule } from '@nestjs/testing';
import { AvailabilityService } from './availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('AvailabilityService', () => {
  let service: AvailabilityService;

  const mockBranchFindFirst = jest.fn();
  const mockStaffFindFirst = jest.fn();
  const mockStaffFindMany = jest.fn();
  const mockServiceFindFirst = jest.fn();
  const mockStaffServiceFindUnique = jest.fn();
  const mockLeaveFindMany = jest.fn();
  const mockAppointmentFindMany = jest.fn();

  const mockPrisma = {
    branch: { findFirst: mockBranchFindFirst },
    staff: { findFirst: mockStaffFindFirst, findMany: mockStaffFindMany },
    service: { findFirst: mockServiceFindFirst },
    staffService: { findUnique: mockStaffServiceFindUnique },
    leave: { findMany: mockLeaveFindMany },
    appointment: { findMany: mockAppointmentFindMany },
  };

  const businessId = 'biz-1';
  const branchId = 'branch-1';
  const serviceId = 'srv-1';
  const staffId = 'staff-1';

  const mockBranch = {
    id: branchId,
    businessId,
    name: 'Main Branch',
    timezone: 'Asia/Kolkata', // UTC+05:30
    workingHours: {
      monday: { open: '10:00', close: '11:00' }, // 1 hour window for easy slot calculations in tests
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    },
  };

  const mockStaff = {
    id: staffId,
    businessId,
    branchId,
    name: 'John Doe',
    workingHours: {
      monday: { open: '10:00', close: '12:00' },
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    },
  };

  const mockService = {
    id: serviceId,
    businessId,
    name: 'Haircut',
    duration: 30,
    bufferTime: 15,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);
    jest.clearAllMocks();
  });

  describe('getAvailableSlots', () => {
    it('should generate available slots correctly for a single staff member', async () => {
      mockBranchFindFirst.mockResolvedValue(mockBranch);
      mockServiceFindFirst.mockResolvedValue(mockService);
      mockStaffFindFirst.mockResolvedValue(mockStaff);
      mockStaffServiceFindUnique.mockResolvedValue({ staffId, serviceId });
      mockLeaveFindMany.mockResolvedValue([]);
      mockAppointmentFindMany.mockResolvedValue([]);

      // 2026-06-15 is a Monday. Local operating hour intersection is 10:00 to 11:00 (since branch closes at 11:00).
      // Slots should start at 10:00 (UTC 04:30) and 10:15 (UTC 04:45).
      // A slot at 10:30 (UTC 05:00) with 30 min duration finishes at 11:00 (UTC 05:30), which is also valid.
      // So slot starts should be 10:00, 10:15, 10:30.
      const result = await service.getAvailableSlots(businessId, {
        branchId,
        serviceId,
        date: '2026-06-15',
        staffId,
      });

      expect(result).toHaveLength(3);
      // UTC representation for 10:00 Asia/Kolkata is 04:30 UTC
      expect(result[0].startTime).toEqual(new Date('2026-06-15T04:30:00.000Z'));
      expect(result[0].endTime).toEqual(new Date('2026-06-15T05:00:00.000Z'));
      expect(result[0].staffId).toEqual(staffId);

      expect(result[1].startTime).toEqual(new Date('2026-06-15T04:45:00.000Z'));
      expect(result[2].startTime).toEqual(new Date('2026-06-15T05:00:00.000Z'));
    });

    it('should filter out slots overlapping with staff leaves', async () => {
      mockBranchFindFirst.mockResolvedValue(mockBranch);
      mockServiceFindFirst.mockResolvedValue(mockService);
      mockStaffFindFirst.mockResolvedValue(mockStaff);
      mockStaffServiceFindUnique.mockResolvedValue({ staffId, serviceId });

      // Leave on Monday 15-June-2026 from 10:15 to 10:45 local (UTC 04:45 to 05:15)
      mockLeaveFindMany.mockResolvedValue([
        {
          id: 'leave-1',
          startTime: new Date('2026-06-15T04:45:00.000Z'),
          endTime: new Date('2026-06-15T05:15:00.000Z'),
        },
      ]);
      mockAppointmentFindMany.mockResolvedValue([]);

      const result = await service.getAvailableSlots(businessId, {
        branchId,
        serviceId,
        date: '2026-06-15',
        staffId,
      });

      // 10:00 local (04:30 UTC) to 10:30 local (05:00 UTC) overlaps with leave start at 10:15 local
      // 10:15 local overlaps
      // 10:30 local (05:00 UTC) to 11:00 local (05:30 UTC) overlaps with leave end at 10:45 local
      // So no slots should be available!
      expect(result).toHaveLength(0);
    });

    it('should filter out slots overlapping with existing appointments and buffers', async () => {
      mockBranchFindFirst.mockResolvedValue(mockBranch);
      mockServiceFindFirst.mockResolvedValue(mockService);
      mockStaffFindFirst.mockResolvedValue(mockStaff);
      mockStaffServiceFindUnique.mockResolvedValue({ staffId, serviceId });
      mockLeaveFindMany.mockResolvedValue([]);

      // Existing appointment from 10:00 to 10:30 local (UTC 04:30 to 05:00) with 15 min buffer (blocks until 10:45 local / UTC 05:15)
      mockAppointmentFindMany.mockResolvedValue([
        {
          id: 'appt-1',
          startTime: new Date('2026-06-15T04:30:00.000Z'),
          endTime: new Date('2026-06-15T05:00:00.000Z'),
          service: {
            bufferTime: 15,
          },
        },
      ]);

      const result = await service.getAvailableSlots(businessId, {
        branchId,
        serviceId,
        date: '2026-06-15',
        staffId,
      });

      // Candidate starts: 10:00, 10:15, 10:30.
      // 10:00 (with buffer blocks 10:00 to 10:45) -> overlaps
      // 10:15 (with buffer blocks 10:15 to 11:00) -> overlaps
      // 10:30 (starts at 10:30, ends 11:00 with 15 min buffer blocking until 11:15). Wait, existing appt blocks until 10:45 local, so proposed start at 10:30 local is blocked (10:30 < 10:45).
      // So no slots should be available!
      expect(result).toHaveLength(0);
    });

    it('should aggregate slots across all assigned staff when no staffId is provided', async () => {
      mockBranchFindFirst.mockResolvedValue(mockBranch);
      mockServiceFindFirst.mockResolvedValue(mockService);

      // Two active staff members assigned to the service
      const staffA = { ...mockStaff, id: 'staff-A', name: 'Alice' };
      const staffB = { ...mockStaff, id: 'staff-B', name: 'Bob' };
      mockStaffFindMany.mockResolvedValue([staffA, staffB]);

      mockLeaveFindMany.mockResolvedValue([]);
      mockAppointmentFindMany.mockResolvedValue([]);

      const result = await service.getAvailableSlots(businessId, {
        branchId,
        serviceId,
        date: '2026-06-15',
      });

      // Alice: 3 slots. Bob: 3 slots. Combined: 6 slots. Sorted chronologically.
      expect(result).toHaveLength(6);
      expect(result[0].staffId).toBe('staff-A');
      expect(result[1].staffId).toBe('staff-B');
      expect(result[0].startTime).toEqual(result[1].startTime);
    });

    it('should throw NotFoundException if branch does not exist', async () => {
      mockBranchFindFirst.mockResolvedValue(null);

      await expect(
        service.getAvailableSlots(businessId, {
          branchId,
          serviceId,
          date: '2026-06-15',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
