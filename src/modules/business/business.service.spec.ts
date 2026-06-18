jest.mock('uuid', () => ({
  v4: () => 'mocked-uuid',
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BusinessService } from './business.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DEFAULT_WORKING_HOURS } from './dto/working-hours.dto';

describe('BusinessService', () => {
  let service: BusinessService;

  const planFindUnique = jest.fn();
  const businessCreate = jest.fn();
  const businessFindUnique = jest.fn();
  const businessFindUniqueOrThrow = jest.fn();
  const businessUpdate = jest.fn();
  const businessUpdateMany = jest.fn();
  const branchCreate = jest.fn();
  const memberCreate = jest.fn();
  const memberFindFirst = jest.fn();
  const subscriptionCreate = jest.fn();
  const generateTokenPair = jest.fn();

  const mockPrisma = {
    subscriptionPlan: {
      findUnique: planFindUnique,
    },
    business: {
      create: businessCreate,
      findUnique: businessFindUnique,
      findUniqueOrThrow: businessFindUniqueOrThrow,
      update: businessUpdate,
      updateMany: businessUpdateMany,
    },
    branch: {
      create: branchCreate,
    },
    businessMember: {
      create: memberCreate,
      findFirst: memberFindFirst,
    },
    subscription: {
      create: subscriptionCreate,
    },
    $transaction: jest.fn(),
  };

  const mockAuthService = {
    generateTokenPair,
  };

  beforeEach(async () => {
    mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        const cb = arg as (tx: typeof mockPrisma) => Promise<unknown>;
        return cb(mockPrisma);
      }
      return arg;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    service = module.get<BusinessService>(BusinessService);

    jest.clearAllMocks();
  });

  describe('registerBusiness', () => {
    const userId = 'user-uuid';
    const email = 'owner@example.com';
    const createDto = {
      name: 'Glow Studio',
      slug: 'glow-studio',
      phone: '+919876543210',
      email: 'glow@example.com',
      description: 'Glow salon',
      branch: {
        name: 'Main Branch',
        address: '123 Main St',
        phone: '+919876543210',
        email: 'main@glow.com',
        timezone: 'Asia/Kolkata',
      },
    };

    it('should throw BadRequestException if trial plan does not exist', async () => {
      memberFindFirst.mockResolvedValue(null);
      planFindUnique.mockResolvedValue(null);

      await expect(
        service.registerBusiness(userId, email, createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if user is already a member of a business', async () => {
      memberFindFirst.mockResolvedValue({ id: 'existing-member-uuid' });

      await expect(
        service.registerBusiness(userId, email, createDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should register business and return new token pair', async () => {
      memberFindFirst.mockResolvedValue(null);
      const mockPlan = { id: 'plan-uuid', slug: 'free-trial' };
      planFindUnique.mockResolvedValue(mockPlan);
      businessFindUnique.mockResolvedValue(null); // Slug is free

      const mockBusiness = {
        id: 'business-uuid',
        name: 'Glow Studio',
        slug: 'glow-studio',
      };
      const mockBranch = { id: 'branch-uuid', name: 'Main Branch' };
      const mockMember = {
        id: 'member-uuid',
        businessId: 'business-uuid',
        roleId: '00000000-0000-0000-0000-000000000001',
      };
      const mockSubscription = { id: 'sub-uuid' };

      businessCreate.mockResolvedValue(mockBusiness);
      branchCreate.mockResolvedValue(mockBranch);
      memberCreate.mockResolvedValue(mockMember);
      subscriptionCreate.mockResolvedValue(mockSubscription);

      generateTokenPair.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const result = await service.registerBusiness(userId, email, createDto);

      expect(businessCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Glow Studio',
            slug: 'glow-studio',
            planId: 'plan-uuid',
            subscriptionStatus: 'TRIALING',
          }) as unknown,
        }),
      );

      expect(branchCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessId: 'business-uuid',
            name: 'Main Branch',
            workingHours: DEFAULT_WORKING_HOURS,
          }) as unknown,
        }),
      );

      expect(generateTokenPair).toHaveBeenCalledWith(
        userId,
        email,
        'business-uuid',
        'member-uuid',
        '00000000-0000-0000-0000-000000000001',
      );

      expect(result).toEqual({
        business: mockBusiness,
        branch: mockBranch,
        subscription: mockSubscription,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('should resolve slug collision by appending numeric suffix', async () => {
      memberFindFirst.mockResolvedValue(null);
      const mockPlan = { id: 'plan-uuid', slug: 'free-trial' };
      planFindUnique.mockResolvedValue(mockPlan);

      // mock business.findUnique to return existing for 'glow-studio', but null for 'glow-studio-2'
      businessFindUnique
        .mockResolvedValueOnce({ id: 'other-biz' }) // for glow-studio
        .mockResolvedValueOnce(null); // for glow-studio-2

      const mockBusiness = {
        id: 'business-uuid',
        name: 'Glow Studio',
        slug: 'glow-studio-2',
      };
      businessCreate.mockResolvedValue(mockBusiness);
      branchCreate.mockResolvedValue({});
      memberCreate.mockResolvedValue({ id: 'member-uuid' });
      subscriptionCreate.mockResolvedValue({});

      generateTokenPair.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const result = await service.registerBusiness(userId, email, {
        ...createDto,
        slug: undefined, // test auto-generation
      });

      expect(result.business.slug).toBe('glow-studio-2');
      expect(businessCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'glow-studio-2',
          }) as unknown,
        }),
      );
    });

    it('should throw ConflictException if custom slug is already taken (strict mode)', async () => {
      memberFindFirst.mockResolvedValue(null);
      const mockPlan = { id: 'plan-uuid', slug: 'free-trial' };
      planFindUnique.mockResolvedValue(mockPlan);
      businessFindUnique.mockResolvedValue({ id: 'existing-biz' }); // slug is taken

      await expect(
        service.registerBusiness(userId, email, {
          ...createDto,
          slug: 'glow-studio',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('isSlugAvailable', () => {
    it('should return false if slug is less than 3 characters', async () => {
      const result = await service.isSlugAvailable('ab');
      expect(result).toBe(false);
    });

    it('should return false if slug is already taken', async () => {
      businessFindUnique.mockResolvedValue({ id: 'existing-biz' });
      const result = await service.isSlugAvailable('glow-studio');
      expect(result).toBe(false);
      expect(businessFindUnique).toHaveBeenCalledWith({
        where: { slug: 'glow-studio' },
      });
    });

    it('should return true if slug is available', async () => {
      businessFindUnique.mockResolvedValue(null);
      const result = await service.isSlugAvailable('fresh-slug');
      expect(result).toBe(true);
      expect(businessFindUnique).toHaveBeenCalledWith({
        where: { slug: 'fresh-slug' },
      });
    });
  });

  describe('findCurrent', () => {
    it('should throw NotFoundException if business not found', async () => {
      businessFindUnique.mockResolvedValue(null);

      await expect(service.findCurrent('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return business with branches if found', async () => {
      const mockBusiness = {
        id: 'business-uuid',
        name: 'Glow Studio',
        branches: [],
      };
      businessFindUnique.mockResolvedValue(mockBusiness);

      const result = await service.findCurrent('business-uuid');
      expect(result).toEqual(mockBusiness);
    });
  });

  describe('update', () => {
    const updateDto = {
      name: 'Glow Studio Updated',
      version: 1,
    };

    it('should throw ConflictException if update fails with version mismatch', async () => {
      businessUpdateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update('business-uuid', 'user-uuid', updateDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should update business and return updated record', async () => {
      businessUpdateMany.mockResolvedValue({ count: 1 });
      const updatedBusiness = {
        id: 'business-uuid',
        name: 'Glow Studio Updated',
        version: 2,
      };
      businessFindUniqueOrThrow.mockResolvedValue(updatedBusiness);

      const result = await service.update(
        'business-uuid',
        'user-uuid',
        updateDto,
      );
      expect(result).toEqual(updatedBusiness);
      expect(businessUpdateMany).toHaveBeenCalledWith({
        where: { id: 'business-uuid', version: 1 },
        data: {
          name: 'Glow Studio Updated',
          updatedBy: 'user-uuid',
          version: { increment: 1 },
        },
      });
    });
  });

  describe('softDelete', () => {
    it('should soft delete business and return success message', async () => {
      businessUpdate.mockResolvedValue({ id: 'business-uuid' });

      const result = await service.softDelete('business-uuid', 'user-uuid');
      expect(result).toEqual({ message: 'Business deleted successfully' });
      expect(businessUpdate).toHaveBeenCalledWith({
        where: { id: 'business-uuid' },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          deletedAt: expect.any(Date),
          updatedBy: 'user-uuid',
        },
      });
    });
  });
});
