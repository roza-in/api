import { Test, TestingModule } from '@nestjs/testing';
import { StaffService } from './staff.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../permissions/entitlements.service';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('StaffService', () => {
  let service: StaffService;

  const staffCreate = jest.fn();
  const staffFindFirst = jest.fn();
  const staffFindUnique = jest.fn();
  const staffFindUniqueOrThrow = jest.fn();
  const staffFindMany = jest.fn();
  const staffUpdate = jest.fn();
  const staffUpdateMany = jest.fn();
  const staffCount = jest.fn();

  const staffServiceCreateMany = jest.fn();
  const staffServiceDeleteMany = jest.fn();

  const branchFindFirst = jest.fn();
  const serviceCount = jest.fn();

  const userFindUnique = jest.fn();
  const userCreate = jest.fn();

  const roleFindFirst = jest.fn();

  const businessMemberFindUnique = jest.fn();
  const businessMemberCreate = jest.fn();

  const leaveFindFirst = jest.fn();
  const leaveCreate = jest.fn();
  const leaveUpdate = jest.fn();

  const mockPrisma = {
    staff: {
      create: staffCreate,
      findFirst: staffFindFirst,
      findUnique: staffFindUnique,
      findUniqueOrThrow: staffFindUniqueOrThrow,
      findMany: staffFindMany,
      update: staffUpdate,
      updateMany: staffUpdateMany,
      count: staffCount,
    },
    staffService: {
      createMany: staffServiceCreateMany,
      deleteMany: staffServiceDeleteMany,
    },
    branch: {
      findFirst: branchFindFirst,
    },
    service: {
      count: serviceCount,
    },
    user: {
      findUnique: userFindUnique,
      create: userCreate,
    },
    role: {
      findFirst: roleFindFirst,
    },
    businessMember: {
      findUnique: businessMemberFindUnique,
      create: businessMemberCreate,
    },
    leave: {
      findFirst: leaveFindFirst,
      create: leaveCreate,
      update: leaveUpdate,
    },
    $transaction: jest.fn(),
  };

  const mockEntitlements = {
    assertStaffLimit: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    // Transaction wrapper mock passing mockPrisma
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EntitlementsService, useValue: mockEntitlements },
        { provide: getQueueToken('notifications'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<StaffService>(StaffService);

    jest.clearAllMocks();
  });

  const businessId = 'business-uuid';
  const userId = 'user-uuid';

  describe('createStaff', () => {
    const createDto = {
      branchId: 'branch-uuid',
      name: 'John Doe',
      phone: '+919876543210',
      email: 'john@example.com',
      serviceIds: ['service-1'],
    };

    it('should create staff and assign services successfully', async () => {
      mockEntitlements.assertStaffLimit.mockResolvedValue(undefined);
      branchFindFirst.mockResolvedValue({ id: 'branch-uuid' });
      serviceCount.mockResolvedValue(1);

      const mockStaff = { id: 'staff-uuid', name: 'John Doe' };
      staffCreate.mockResolvedValue(mockStaff);
      staffFindUniqueOrThrow.mockResolvedValue(mockStaff);

      const result = await service.createStaff(businessId, userId, createDto);

      expect(result).toEqual(mockStaff);
      expect(mockEntitlements.assertStaffLimit).toHaveBeenCalledWith(
        businessId,
      );
      expect(branchFindFirst).toHaveBeenCalledWith({
        where: { id: 'branch-uuid', businessId, deletedAt: null },
      });
      expect(staffCreate).toHaveBeenCalled();
      expect(staffServiceCreateMany).toHaveBeenCalledWith({
        data: [{ staffId: 'staff-uuid', serviceId: 'service-1' }],
      });
    });

    it('should throw BadRequestException if branch does not exist/belong to business', async () => {
      mockEntitlements.assertStaffLimit.mockResolvedValue(undefined);
      branchFindFirst.mockResolvedValue(null);

      await expect(
        service.createStaff(businessId, userId, createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if one or more services do not exist/belong to business', async () => {
      mockEntitlements.assertStaffLimit.mockResolvedValue(undefined);
      branchFindFirst.mockResolvedValue({ id: 'branch-uuid' });
      serviceCount.mockResolvedValue(0); // service invalid

      await expect(
        service.createStaff(businessId, userId, createDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateStaff', () => {
    const staffId = 'staff-uuid';
    const updateDto = {
      name: 'John Updated',
      version: 1,
      serviceIds: ['service-2'],
    };

    it('should update staff details and sync service links', async () => {
      staffFindFirst.mockResolvedValue({ id: staffId });
      staffUpdateMany.mockResolvedValue({ count: 1 });
      serviceCount.mockResolvedValue(1);

      const updatedMock = { id: staffId, name: 'John Updated' };
      staffFindUniqueOrThrow.mockResolvedValue(updatedMock);

      const result = await service.updateStaff(
        businessId,
        userId,
        staffId,
        updateDto,
      );

      expect(result).toEqual(updatedMock);
      expect(staffUpdateMany).toHaveBeenCalledWith({
        where: { id: staffId, businessId, version: 1, deletedAt: null },
        data: {
          name: 'John Updated',
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      expect(staffServiceDeleteMany).toHaveBeenCalledWith({
        where: { staffId },
      });
      expect(staffServiceCreateMany).toHaveBeenCalledWith({
        data: [{ staffId, serviceId: 'service-2' }],
      });
    });

    it('should throw ConflictException if version mismatch occurs', async () => {
      staffFindFirst.mockResolvedValue({ id: staffId });
      staffUpdateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateStaff(businessId, userId, staffId, updateDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDeleteStaff', () => {
    const staffId = 'staff-uuid';

    it('should soft delete staff and unlink business member', async () => {
      staffFindFirst.mockResolvedValue({ id: staffId });
      staffServiceDeleteMany.mockResolvedValue({});
      staffUpdate.mockResolvedValue({});

      const result = await service.softDeleteStaff(businessId, userId, staffId);

      expect(result).toEqual({ message: 'Staff member deleted successfully' });
      expect(staffServiceDeleteMany).toHaveBeenCalledWith({
        where: { staffId },
      });
      expect(staffUpdate).toHaveBeenCalledWith({
        where: { id: staffId },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          deletedAt: expect.any(Date),
          memberId: null,
          updatedBy: userId,
        },
      });
    });
  });

  describe('inviteStaff', () => {
    const staffId = 'staff-uuid';
    const mockStaff = {
      id: staffId,
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+919876543210',
    };

    it('should create user and business member if missing, then link staff and queue invite', async () => {
      staffFindFirst.mockResolvedValue(mockStaff);
      userFindUnique.mockResolvedValue(null);
      userCreate.mockResolvedValue({ id: 'user-uuid' });
      roleFindFirst.mockResolvedValue({ id: 'role-uuid' });
      businessMemberFindUnique.mockResolvedValue(null);
      businessMemberCreate.mockResolvedValue({ id: 'member-uuid' });
      staffUpdate.mockResolvedValue({});
      mockQueue.add.mockResolvedValue({});

      const result = await service.inviteStaff(businessId, userId, staffId);

      expect(result).toEqual({ message: 'Staff invitation sent successfully' });
      expect(userCreate).toHaveBeenCalledWith({
        data: {
          email: 'john@example.com',
          passwordHash: '',
          status: 'PENDING',
        },
      });
      expect(businessMemberCreate).toHaveBeenCalledWith({
        data: {
          userId: 'user-uuid',
          businessId,
          roleId: 'role-uuid',
        },
      });
      expect(staffUpdate).toHaveBeenCalledWith({
        where: { id: staffId },
        data: {
          memberId: 'member-uuid',
          updatedBy: userId,
        },
      });
      expect(mockQueue.add).toHaveBeenCalledWith('staff-invite', {
        staffId,
        businessId,
        email: 'john@example.com',
        phone: '+919876543210',
      });
    });
  });

  describe('leaves', () => {
    const staffId = 'staff-uuid';
    const leaveDto = {
      startTime: '2026-06-20T10:00:00Z',
      endTime: '2026-06-20T18:00:00Z',
      reason: 'Sick leave',
    };

    describe('createLeave', () => {
      it('should create leave successfully if no overlaps exist', async () => {
        staffFindFirst.mockResolvedValue({ id: staffId });
        leaveFindFirst.mockResolvedValue(null); // No overlap
        leaveCreate.mockResolvedValue({ id: 'leave-1' });

        const result = await service.createLeave(
          businessId,
          userId,
          staffId,
          leaveDto,
        );

        expect(result).toEqual({ id: 'leave-1' });
        expect(leaveCreate).toHaveBeenCalledWith({
          data: {
            businessId,
            staffId,
            startTime: new Date(leaveDto.startTime),
            endTime: new Date(leaveDto.endTime),
            reason: 'Sick leave',
          },
        });
      });

      it('should throw BadRequestException if end time is before start time', async () => {
        staffFindFirst.mockResolvedValue({ id: staffId });

        await expect(
          service.createLeave(businessId, userId, staffId, {
            ...leaveDto,
            endTime: '2026-06-20T09:00:00Z',
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw ConflictException if leave overlaps with an existing leave', async () => {
        staffFindFirst.mockResolvedValue({ id: staffId });
        leaveFindFirst.mockResolvedValue({ id: 'existing-leave' }); // Overlap exists

        await expect(
          service.createLeave(businessId, userId, staffId, leaveDto),
        ).rejects.toThrow(ConflictException);
      });
    });

    describe('softDeleteLeave', () => {
      const leaveId = 'leave-uuid';

      it('should soft delete leave from database', async () => {
        leaveFindFirst.mockResolvedValue({ id: leaveId });
        leaveUpdate.mockResolvedValue({});

        const result = await service.softDeleteLeave(
          businessId,
          userId,
          leaveId,
        );

        expect(result).toEqual({ message: 'Leave deleted successfully' });
        expect(leaveUpdate).toHaveBeenCalledWith({
          where: { id: leaveId },
          data: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            deletedAt: expect.any(Date),
          },
        });
      });
    });
  });
});
