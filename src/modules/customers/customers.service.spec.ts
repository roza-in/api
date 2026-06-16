import { Test, TestingModule } from '@nestjs/testing';
import { CustomersService } from './customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('CustomersService', () => {
  let service: CustomersService;

  const customerCreate = jest.fn();
  const customerFindFirst = jest.fn();
  const customerFindUnique = jest.fn();
  const customerFindUniqueOrThrow = jest.fn();
  const customerFindMany = jest.fn();
  const customerUpdate = jest.fn();
  const customerUpdateMany = jest.fn();
  const customerCount = jest.fn();
  const paymentAggregate = jest.fn();

  const mockPrisma = {
    customer: {
      create: customerCreate,
      findFirst: customerFindFirst,
      findUnique: customerFindUnique,
      findUniqueOrThrow: customerFindUniqueOrThrow,
      findMany: customerFindMany,
      update: customerUpdate,
      updateMany: customerUpdateMany,
      count: customerCount,
    },
    payment: {
      aggregate: paymentAggregate,
    },
    $transaction: jest.fn(),
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
        CustomersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);

    jest.clearAllMocks();
  });

  const businessId = 'business-uuid';
  const userId = 'user-uuid';

  describe('createCustomer', () => {
    const createDto = {
      name: 'Jane Smith',
      phone: '+919876543211',
      email: 'jane@example.com',
    };

    it('should create customer successfully if phone number is unique', async () => {
      customerFindFirst.mockResolvedValue(null);
      const mockCustomer = { id: 'cust-1', name: 'Jane Smith' };
      customerCreate.mockResolvedValue(mockCustomer);

      const result = await service.createCustomer(
        businessId,
        userId,
        createDto,
      );

      expect(result).toEqual(mockCustomer);
      expect(customerFindFirst).toHaveBeenCalledWith({
        where: { businessId, phone: createDto.phone, deletedAt: null },
      });
      expect(customerCreate).toHaveBeenCalledWith({
        data: {
          businessId,
          name: 'Jane Smith',
          phone: '+919876543211',
          email: 'jane@example.com',
          gender: undefined,
          birthday: null,
          notes: undefined,
          totalSpent: 0,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    });

    it('should throw ConflictException if customer with phone already exists', async () => {
      customerFindFirst.mockResolvedValue({ id: 'cust-1' });

      await expect(
        service.createCustomer(businessId, userId, createDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return paginated list of customers', async () => {
      const mockList = [{ id: 'cust-1' }, { id: 'cust-2' }];
      customerFindMany.mockResolvedValue(mockList);
      customerCount.mockResolvedValue(2);

      const result = await service.findAll(businessId, { page: 1, limit: 10 });

      expect(result.items).toEqual(mockList);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(customerFindMany).toHaveBeenCalledWith({
        where: { businessId, deletedAt: null },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should search with mode insensitive search filters', async () => {
      customerFindMany.mockResolvedValue([]);
      customerCount.mockResolvedValue(0);

      await service.findAll(businessId, { page: 1, limit: 10, search: 'Jane' });

      expect(customerFindMany).toHaveBeenCalledWith({
        where: {
          businessId,
          deletedAt: null,
          OR: [
            { name: { contains: 'Jane', mode: 'insensitive' } },
            { phone: { contains: 'Jane', mode: 'insensitive' } },
            { email: { contains: 'Jane', mode: 'insensitive' } },
          ],
        },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return single customer with appointments history', async () => {
      const mockCustomer = {
        id: 'cust-1',
        name: 'Jane Smith',
        appointments: [],
      };
      customerFindFirst.mockResolvedValue(mockCustomer);

      const result = await service.findOne(businessId, 'cust-1');

      expect(result).toEqual(mockCustomer);
      expect(customerFindFirst).toHaveBeenCalledWith({
        where: { id: 'cust-1', businessId, deletedAt: null },
        include: {
          appointments: {
            where: { deletedAt: null },
            include: { service: true, staff: true },
            orderBy: { startTime: 'desc' },
          },
        },
      });
    });

    it('should throw NotFoundException if customer does not exist', async () => {
      customerFindFirst.mockResolvedValue(null);

      await expect(service.findOne(businessId, 'cust-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateCustomer', () => {
    const customerId = 'cust-1';
    const updateDto = {
      name: 'Jane Smith Updated',
      version: 1,
    };

    it('should update customer using optimistic concurrency locking', async () => {
      customerFindFirst.mockResolvedValue({
        id: customerId,
        phone: '+919876543211',
      });
      customerUpdateMany.mockResolvedValue({ count: 1 });
      const mockUpdated = { id: customerId, name: 'Jane Smith Updated' };
      customerFindUniqueOrThrow.mockResolvedValue(mockUpdated);

      const result = await service.updateCustomer(
        businessId,
        userId,
        customerId,
        updateDto,
      );

      expect(result).toEqual(mockUpdated);
      expect(customerUpdateMany).toHaveBeenCalledWith({
        where: { id: customerId, businessId, version: 1, deletedAt: null },
        data: {
          name: 'Jane Smith Updated',
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
    });

    it('should throw ConflictException on version mismatch', async () => {
      customerFindFirst.mockResolvedValue({
        id: customerId,
        phone: '+919876543211',
      });
      customerUpdateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateCustomer(businessId, userId, customerId, updateDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDeleteCustomer', () => {
    const customerId = 'cust-1';

    it('should soft delete and scrub personal details to anonymize', async () => {
      customerFindFirst.mockResolvedValue({ id: customerId });
      customerUpdate.mockResolvedValue({});

      const result = await service.softDeleteCustomer(
        businessId,
        userId,
        customerId,
      );

      expect(result).toEqual({
        message: 'Customer profile deleted and anonymized successfully',
      });
      expect(customerUpdate).toHaveBeenCalledWith({
        where: { id: customerId },
        data: {
          name: 'Anonymized Customer',
          phone: 'anonymized-cust-1',
          email: null,
          gender: null,
          birthday: null,
          notes: null,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          deletedAt: expect.any(Date),
          updatedBy: userId,
        },
      });
    });

    it('should throw NotFoundException if customer not found', async () => {
      customerFindFirst.mockResolvedValue(null);

      await expect(
        service.softDeleteCustomer(businessId, userId, customerId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('recalculateTotalSpent', () => {
    const customerId = 'cust-1';

    it('should recalculate total spent based on successful payments', async () => {
      customerFindFirst.mockResolvedValue({ id: customerId });
      paymentAggregate.mockResolvedValue({ _sum: { amount: 1500 } });
      customerUpdate.mockResolvedValue({});

      const result = await service.recalculateTotalSpent(
        businessId,
        customerId,
      );

      expect(result).toEqual({ totalSpent: 1500 });
      expect(paymentAggregate).toHaveBeenCalledWith({
        where: {
          businessId,
          status: 'SUCCESS',
          appointment: {
            customerId,
            status: { in: ['CONFIRMED', 'COMPLETED', 'RESCHEDULED'] },
          },
        },
        _sum: { amount: true },
      });
      expect(customerUpdate).toHaveBeenCalledWith({
        where: { id: customerId },
        data: { totalSpent: 1500 },
      });
    });
  });
});
