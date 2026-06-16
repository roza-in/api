import { Test, TestingModule } from '@nestjs/testing';
import { BranchService } from './branch.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../permissions/entitlements.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { DEFAULT_WORKING_HOURS } from './dto/working-hours.dto';

describe('BranchService', () => {
  let service: BranchService;

  const mockPrisma = {
    branch: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockEntitlementsService = {
    assertBranchLimit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EntitlementsService, useValue: mockEntitlementsService },
      ],
    }).compile();

    service = module.get<BranchService>(BranchService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    const businessId = 'business-uuid';
    const userId = 'user-uuid';
    const createDto = {
      name: 'South Branch',
      address: '456 South St',
      phone: '+919876543210',
      email: 'south@glow.com',
      timezone: 'Asia/Kolkata',
    };

    it('should create a branch with default working hours', async () => {
      mockEntitlementsService.assertBranchLimit.mockResolvedValue(undefined);
      const mockBranch = { id: 'branch-uuid', name: 'South Branch' };
      mockPrisma.branch.create.mockResolvedValue(mockBranch);

      const result = await service.create(businessId, userId, createDto);

      expect(mockPrisma.branch.create).toHaveBeenCalledWith({
        data: {
          businessId,
          name: 'South Branch',
          address: '456 South St',
          phone: '+919876543210',
          email: 'south@glow.com',
          timezone: 'Asia/Kolkata',
          workingHours: DEFAULT_WORKING_HOURS,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      expect(result).toEqual(mockBranch);
    });
  });

  describe('findAll', () => {
    it('should return all active branches for a business', async () => {
      const mockBranches = [{ id: 'b1' }, { id: 'b2' }];
      mockPrisma.branch.findMany.mockResolvedValue(mockBranches);

      const result = await service.findAll('business-uuid');

      expect(mockPrisma.branch.findMany).toHaveBeenCalledWith({
        where: { businessId: 'business-uuid', deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual(mockBranches);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if branch not found', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('business-uuid', 'branch-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return branch if found', async () => {
      const mockBranch = { id: 'branch-uuid', businessId: 'business-uuid' };
      mockPrisma.branch.findFirst.mockResolvedValue(mockBranch);

      const result = await service.findOne('business-uuid', 'branch-uuid');
      expect(result).toEqual(mockBranch);
    });
  });

  describe('update', () => {
    const updateDto = {
      name: 'Updated Branch',
      version: 1,
    };

    it('should throw NotFoundException if branch to update is not found', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);

      await expect(
        service.update('business-uuid', 'user-uuid', 'branch-uuid', updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if update finds no records matching version', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue({ id: 'branch-uuid' });
      mockPrisma.branch.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update('business-uuid', 'user-uuid', 'branch-uuid', updateDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should update and return branch on success', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue({ id: 'branch-uuid' });
      mockPrisma.branch.updateMany.mockResolvedValue({ count: 1 });
      const updatedBranch = {
        id: 'branch-uuid',
        name: 'Updated Branch',
        version: 2,
      };
      mockPrisma.branch.findFirstOrThrow.mockResolvedValue(updatedBranch);

      const result = await service.update(
        'business-uuid',
        'user-uuid',
        'branch-uuid',
        updateDto,
      );
      expect(result).toEqual(updatedBranch);
      expect(mockPrisma.branch.updateMany).toHaveBeenCalledWith({
        where: { id: 'branch-uuid', businessId: 'business-uuid', version: 1 },
        data: {
          name: 'Updated Branch',
          updatedBy: 'user-uuid',
          version: { increment: 1 },
        },
      });
    });
  });

  describe('softDelete', () => {
    it('should throw NotFoundException if branch not found', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);

      await expect(
        service.softDelete('business-uuid', 'user-uuid', 'branch-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if trying to delete the last branch', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue({ id: 'branch-uuid' });
      mockPrisma.branch.count.mockResolvedValue(1);

      await expect(
        service.softDelete('business-uuid', 'user-uuid', 'branch-uuid'),
      ).rejects.toThrow(ConflictException);
    });

    it('should soft delete and return success message', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue({ id: 'branch-uuid' });
      mockPrisma.branch.count.mockResolvedValue(2);
      mockPrisma.branch.update.mockResolvedValue({ id: 'branch-uuid' });

      const result = await service.softDelete(
        'business-uuid',
        'user-uuid',
        'branch-uuid',
      );
      expect(result).toEqual({ message: 'Branch deleted successfully' });
      expect(mockPrisma.branch.update).toHaveBeenCalledWith({
        where: { id: 'branch-uuid' },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          deletedAt: expect.any(Date),
          updatedBy: 'user-uuid',
        },
      });
    });
  });
});
