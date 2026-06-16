import { Test, TestingModule } from '@nestjs/testing';
import { ConflictService } from './conflict.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

describe('ConflictService', () => {
  let service: ConflictService;

  const mockBranchFindFirst = jest.fn();
  const mockStaffFindFirst = jest.fn();
  const mockServiceFindFirst = jest.fn();
  const mockStaffServiceFindUnique = jest.fn();
  const mockLeaveFindFirst = jest.fn();
  const mockAppointmentFindMany = jest.fn();

  const mockPrisma = {
    branch: { findFirst: mockBranchFindFirst },
    staff: { findFirst: mockStaffFindFirst },
    service: { findFirst: mockServiceFindFirst },
    staffService: { findUnique: mockStaffServiceFindUnique },
    leave: { findFirst: mockLeaveFindFirst },
    appointment: { findMany: mockAppointmentFindMany },
  };

  const businessId = 'biz-1';
  const branchId = 'branch-1';
  const staffId = 'staff-1';
  const serviceId = 'srv-1';

  const mockBranch = {
    id: branchId,
    businessId,
    name: 'Main Branch',
    timezone: 'Asia/Kolkata',
    workingHours: {
      monday: { open: '10:00', close: '20:00' },
      tuesday: { open: '10:00', close: '20:00' },
      wednesday: { open: '10:00', close: '20:00' },
      thursday: { open: '10:00', close: '20:00' },
      friday: { open: '10:00', close: '20:00' },
      saturday: { open: '10:00', close: '20:00' },
      sunday: null,
    },
  };

  const mockStaff = {
    id: staffId,
    businessId,
    branchId,
    name: 'John Doe',
    workingHours: {
      monday: { open: '10:00', close: '18:00' },
      tuesday: { open: '10:00', close: '18:00' },
      wednesday: { open: '10:00', close: '18:00' },
      thursday: { open: '10:00', close: '18:00' },
      friday: { open: '10:00', close: '18:00' },
      saturday: { open: '10:00', close: '18:00' },
      sunday: null,
    },
  };

  const mockService = {
    id: serviceId,
    businessId,
    name: 'Haircut',
    duration: 45,
    bufferTime: 15,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConflictService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ConflictService>(ConflictService);
    jest.clearAllMocks();
  });

  it('should successfully pass conflict checks if time slot is valid and free', async () => {
    mockBranchFindFirst.mockResolvedValue(mockBranch);
    mockStaffFindFirst.mockResolvedValue(mockStaff);
    mockServiceFindFirst.mockResolvedValue(mockService);
    mockStaffServiceFindUnique.mockResolvedValue({ staffId, serviceId });
    mockLeaveFindFirst.mockResolvedValue(null);
    mockAppointmentFindMany.mockResolvedValue([]);

    // Monday 15-June-2026 12:00:00 local time in Asia/Kolkata is 06:30:00 UTC
    const startTime = new Date('2026-06-15T06:30:00.000Z');

    const result = await service.checkConflict(businessId, {
      branchId,
      staffId,
      serviceId,
      startTime,
    });

    expect(result).toBeDefined();
    expect(result.pStart).toEqual(startTime);
    expect(result.pEnd).toEqual(new Date(startTime.getTime() + 45 * 60 * 1000));
  });

  it('should throw NotFoundException if branch does not exist', async () => {
    mockBranchFindFirst.mockResolvedValue(null);

    await expect(
      service.checkConflict(businessId, {
        branchId,
        staffId,
        serviceId,
        startTime: new Date(),
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException if staff does not exist', async () => {
    mockBranchFindFirst.mockResolvedValue(mockBranch);
    mockStaffFindFirst.mockResolvedValue(null);

    await expect(
      service.checkConflict(businessId, {
        branchId,
        staffId,
        serviceId,
        startTime: new Date(),
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException if service does not exist', async () => {
    mockBranchFindFirst.mockResolvedValue(mockBranch);
    mockStaffFindFirst.mockResolvedValue(mockStaff);
    mockServiceFindFirst.mockResolvedValue(null);

    await expect(
      service.checkConflict(businessId, {
        branchId,
        staffId,
        serviceId,
        startTime: new Date(),
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException if staff is not assigned to the service', async () => {
    mockBranchFindFirst.mockResolvedValue(mockBranch);
    mockStaffFindFirst.mockResolvedValue(mockStaff);
    mockServiceFindFirst.mockResolvedValue(mockService);
    mockStaffServiceFindUnique.mockResolvedValue(null);

    await expect(
      service.checkConflict(businessId, {
        branchId,
        staffId,
        serviceId,
        startTime: new Date(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw ConflictException if proposed appointment crosses midnight local time', async () => {
    mockBranchFindFirst.mockResolvedValue(mockBranch);
    mockStaffFindFirst.mockResolvedValue(mockStaff);
    mockServiceFindFirst.mockResolvedValue(mockService);
    mockStaffServiceFindUnique.mockResolvedValue({ staffId, serviceId });

    // Monday 15-June-2026 23:30:00 local time in Asia/Kolkata (UTC 18:00:00). With 45 min duration, it ends at 00:15 next day.
    const startTime = new Date('2026-06-15T18:00:00.000Z');

    await expect(
      service.checkConflict(businessId, {
        branchId,
        staffId,
        serviceId,
        startTime,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw ConflictException if branch is closed on that day', async () => {
    mockBranchFindFirst.mockResolvedValue(mockBranch);
    mockStaffFindFirst.mockResolvedValue(mockStaff);
    mockServiceFindFirst.mockResolvedValue(mockService);
    mockStaffServiceFindUnique.mockResolvedValue({ staffId, serviceId });

    // Sunday 14-June-2026 (branch is closed on Sunday)
    const startTime = new Date('2026-06-14T06:30:00.000Z');

    await expect(
      service.checkConflict(businessId, {
        branchId,
        staffId,
        serviceId,
        startTime,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw ConflictException if outside branch working hours', async () => {
    mockBranchFindFirst.mockResolvedValue(mockBranch);
    mockStaffFindFirst.mockResolvedValue(mockStaff);
    mockServiceFindFirst.mockResolvedValue(mockService);
    mockStaffServiceFindUnique.mockResolvedValue({ staffId, serviceId });

    // Monday 15-June-2026 09:00:00 local (branch opens at 10:00) -> UTC 03:30:00
    const startTime = new Date('2026-06-15T03:30:00.000Z');

    await expect(
      service.checkConflict(businessId, {
        branchId,
        staffId,
        serviceId,
        startTime,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw ConflictException if outside staff working hours', async () => {
    mockBranchFindFirst.mockResolvedValue(mockBranch);
    mockStaffFindFirst.mockResolvedValue(mockStaff);
    mockServiceFindFirst.mockResolvedValue(mockService);
    mockStaffServiceFindUnique.mockResolvedValue({ staffId, serviceId });

    // Monday 15-June-2026 19:00:00 local (staff closes at 18:00) -> UTC 13:30:00
    const startTime = new Date('2026-06-15T13:30:00.000Z');

    await expect(
      service.checkConflict(businessId, {
        branchId,
        staffId,
        serviceId,
        startTime,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw ConflictException if staff is on leave', async () => {
    mockBranchFindFirst.mockResolvedValue(mockBranch);
    mockStaffFindFirst.mockResolvedValue(mockStaff);
    mockServiceFindFirst.mockResolvedValue(mockService);
    mockStaffServiceFindUnique.mockResolvedValue({ staffId, serviceId });
    mockLeaveFindFirst.mockResolvedValue({ id: 'leave-1' });

    const startTime = new Date('2026-06-15T06:30:00.000Z');

    await expect(
      service.checkConflict(businessId, {
        branchId,
        staffId,
        serviceId,
        startTime,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw ConflictException if proposed slot overlaps with an existing appointment (respecting buffers)', async () => {
    mockBranchFindFirst.mockResolvedValue(mockBranch);
    mockStaffFindFirst.mockResolvedValue(mockStaff);
    mockServiceFindFirst.mockResolvedValue(mockService);
    mockStaffServiceFindUnique.mockResolvedValue({ staffId, serviceId });
    mockLeaveFindFirst.mockResolvedValue(null);

    // Existing appointment: Monday 15-June-2026 12:00:00 to 12:45:00 local (UTC 06:30 to 07:15) with 15 mins buffer (so blocks until 13:00 local / 07:30 UTC)
    mockAppointmentFindMany.mockResolvedValue([
      {
        id: 'appt-existing',
        startTime: new Date('2026-06-15T06:30:00.000Z'),
        endTime: new Date('2026-06-15T07:15:00.000Z'),
        service: {
          bufferTime: 15,
        },
      },
    ]);

    // Proposed appointment starting at 12:30:00 local (UTC 07:00:00) -> overlaps with existing appt + buffer (which ends at 07:30 UTC)
    const startTime = new Date('2026-06-15T07:00:00.000Z');

    await expect(
      service.checkConflict(businessId, {
        branchId,
        staffId,
        serviceId,
        startTime,
      }),
    ).rejects.toThrow(ConflictException);
  });
});
