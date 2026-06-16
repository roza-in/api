import { Test, TestingModule } from '@nestjs/testing';
import { ServicesService } from './services.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

describe('ServicesService', () => {
  let service: ServicesService;

  // Define individual mock functions with explicit type inference to satisfy strict linting rules
  const serviceCategoryCreate = jest.fn();
  const serviceCategoryFindFirst = jest.fn();
  const serviceCategoryFindUnique = jest.fn();
  const serviceCategoryFindMany = jest.fn();
  const serviceCategoryUpdate = jest.fn();
  const serviceCategoryCount = jest.fn();

  const serviceCreate = jest.fn();
  const serviceFindFirst = jest.fn();
  const serviceFindUnique = jest.fn();
  const serviceFindUniqueOrThrow = jest.fn();
  const serviceFindMany = jest.fn();
  const serviceUpdate = jest.fn();
  const serviceUpdateMany = jest.fn();
  const serviceCount = jest.fn();

  const staffCount = jest.fn();

  const staffServiceCreateMany = jest.fn();
  const staffServiceDeleteMany = jest.fn();

  const mockPrisma = {
    serviceCategory: {
      create: serviceCategoryCreate,
      findFirst: serviceCategoryFindFirst,
      findUnique: serviceCategoryFindUnique,
      findMany: serviceCategoryFindMany,
      update: serviceCategoryUpdate,
      count: serviceCategoryCount,
    },
    service: {
      create: serviceCreate,
      findFirst: serviceFindFirst,
      findUnique: serviceFindUnique,
      findUniqueOrThrow: serviceFindUniqueOrThrow,
      findMany: serviceFindMany,
      update: serviceUpdate,
      updateMany: serviceUpdateMany,
      count: serviceCount,
    },
    staff: {
      count: staffCount,
    },
    staffService: {
      createMany: staffServiceCreateMany,
      deleteMany: staffServiceDeleteMany,
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    // Transaction wrapper mock that passes the mockPrisma context
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ServicesService>(ServicesService);

    jest.clearAllMocks();
  });

  const businessId = 'business-uuid';
  const userId = 'user-uuid';

  describe('createCategory', () => {
    const createDto = { name: 'Hair' };

    it('should create category successfully', async () => {
      const mockCategory = { id: 'cat-1', name: 'Hair' };
      serviceCategoryCreate.mockResolvedValue(mockCategory);

      const result = await service.createCategory(
        businessId,
        userId,
        createDto,
      );

      expect(result).toEqual(mockCategory);
      expect(serviceCategoryCreate).toHaveBeenCalledWith({
        data: {
          businessId,
          name: 'Hair',
          parentCategoryId: null,
          isActive: true,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    });

    it('should throw BadRequestException if parent category is missing or belongs to another business', async () => {
      serviceCategoryFindFirst.mockResolvedValue(null);

      await expect(
        service.createCategory(businessId, userId, {
          ...createDto,
          parentCategoryId: 'invalid-parent',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('softDeleteCategory', () => {
    const categoryId = 'cat-1';

    it('should throw NotFoundException if category does not exist', async () => {
      serviceCategoryFindFirst.mockResolvedValue(null);

      await expect(
        service.softDeleteCategory(businessId, userId, categoryId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if category has active subcategories', async () => {
      serviceCategoryFindFirst.mockResolvedValue({ id: categoryId });
      serviceCategoryCount.mockResolvedValue(1); // subcategory exists

      await expect(
        service.softDeleteCategory(businessId, userId, categoryId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if category contains active services', async () => {
      serviceCategoryFindFirst.mockResolvedValue({ id: categoryId });
      serviceCategoryCount.mockResolvedValue(0);
      serviceCount.mockResolvedValue(5); // active services exist

      await expect(
        service.softDeleteCategory(businessId, userId, categoryId),
      ).rejects.toThrow(ConflictException);
    });

    it('should soft delete category on success', async () => {
      serviceCategoryFindFirst.mockResolvedValue({ id: categoryId });
      serviceCategoryCount.mockResolvedValue(0);
      serviceCount.mockResolvedValue(0);
      serviceCategoryUpdate.mockResolvedValue({});

      const result = await service.softDeleteCategory(
        businessId,
        userId,
        categoryId,
      );

      expect(result).toEqual({
        message: 'Service category deleted successfully',
      });
      expect(serviceCategoryUpdate).toHaveBeenCalledWith({
        where: { id: categoryId },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          deletedAt: expect.any(Date),
          updatedBy: userId,
        },
      });
    });
  });

  describe('createService', () => {
    const createDto = {
      name: 'Trim',
      duration: 30,
      price: 250,
      categoryId: 'cat-1',
      staffIds: ['staff-1'],
    };

    it('should throw BadRequestException if category does not exist', async () => {
      serviceCategoryFindFirst.mockResolvedValue(null);

      await expect(
        service.createService(businessId, userId, createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if staff does not belong to business', async () => {
      serviceCategoryFindFirst.mockResolvedValue({ id: 'cat-1' });
      staffCount.mockResolvedValue(0); // staff invalid

      await expect(
        service.createService(businessId, userId, createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create service and link staff on success', async () => {
      serviceCategoryFindFirst.mockResolvedValue({ id: 'cat-1' });
      staffCount.mockResolvedValue(1);

      const mockService = { id: 'service-1', name: 'Trim' };
      serviceCreate.mockResolvedValue(mockService);
      serviceFindUniqueOrThrow.mockResolvedValue(mockService);

      const result = await service.createService(businessId, userId, createDto);

      expect(result).toEqual(mockService);
      expect(staffServiceCreateMany).toHaveBeenCalledWith({
        data: [{ serviceId: 'service-1', staffId: 'staff-1' }],
      });
    });
  });

  describe('updateService', () => {
    const serviceId = 'service-1';
    const updateDto = {
      name: 'Trim New',
      version: 1,
      staffIds: ['staff-2'],
    };

    it('should throw ConflictException if version mismatches', async () => {
      serviceFindFirst.mockResolvedValue({ id: serviceId });
      serviceUpdateMany.mockResolvedValue({ count: 0 }); // version mismatch

      await expect(
        service.updateService(businessId, userId, serviceId, updateDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should update service details and sync staff links', async () => {
      serviceFindFirst.mockResolvedValue({ id: serviceId });
      serviceUpdateMany.mockResolvedValue({ count: 1 });
      staffCount.mockResolvedValue(1);

      const updated = { id: serviceId, name: 'Trim New' };
      serviceFindUniqueOrThrow.mockResolvedValue(updated);

      const result = await service.updateService(
        businessId,
        userId,
        serviceId,
        updateDto,
      );

      expect(result).toEqual(updated);
      expect(staffServiceDeleteMany).toHaveBeenCalledWith({
        where: { serviceId },
      });
      expect(staffServiceCreateMany).toHaveBeenCalledWith({
        data: [{ serviceId, staffId: 'staff-2' }],
      });
    });
  });

  describe('softDeleteService', () => {
    const serviceId = 'service-1';

    it('should clear staff links and soft delete service', async () => {
      serviceFindFirst.mockResolvedValue({ id: serviceId });
      staffServiceDeleteMany.mockResolvedValue({});
      serviceUpdate.mockResolvedValue({});

      const result = await service.softDeleteService(
        businessId,
        userId,
        serviceId,
      );

      expect(result).toEqual({ message: 'Service deleted successfully' });
      expect(staffServiceDeleteMany).toHaveBeenCalledWith({
        where: { serviceId },
      });
      expect(serviceUpdate).toHaveBeenCalledWith({
        where: { id: serviceId },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          deletedAt: expect.any(Date),
          updatedBy: userId,
        },
      });
    });
  });
});
