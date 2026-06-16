import { Test, TestingModule } from '@nestjs/testing';
import { WebsitesService } from './websites.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('WebsitesService', () => {
  let service: WebsitesService;

  const websiteFindFirst = jest.fn();
  const websiteFindUnique = jest.fn();
  const websiteCreate = jest.fn();
  const websiteUpdate = jest.fn();
  const businessFindUnique = jest.fn();
  const themeFindUnique = jest.fn();
  const pageCreate = jest.fn();
  const pageUpdateMany = jest.fn();

  const mockPrisma = {
    website: {
      findFirst: websiteFindFirst,
      findUnique: websiteFindUnique,
      create: websiteCreate,
      update: websiteUpdate,
    },
    business: {
      findUnique: businessFindUnique,
    },
    theme: {
      findUnique: themeFindUnique,
    },
    page: {
      create: pageCreate,
      updateMany: pageUpdateMany,
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebsitesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<WebsitesService>(WebsitesService);
    jest.clearAllMocks();
  });

  const businessId = 'business-uuid-1';
  const themeId = 'theme-uuid-1';

  describe('create', () => {
    const createDto = { themeId, subdomain: 'custom-sub' };

    it('should throw ConflictException if website already exists', async () => {
      websiteFindFirst.mockResolvedValue({ id: 'existing-web-id' });

      await expect(service.create(businessId, createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException if business is not found', async () => {
      websiteFindFirst.mockResolvedValue(null);
      businessFindUnique.mockResolvedValue(null);

      await expect(service.create(businessId, createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if custom subdomain is already taken', async () => {
      websiteFindFirst.mockResolvedValue(null);
      businessFindUnique.mockResolvedValue({
        id: businessId,
        name: 'Biz 1',
        slug: 'biz-1',
      });
      websiteFindUnique.mockResolvedValue({ id: 'other-web-id' });

      await expect(service.create(businessId, createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException if theme is not found', async () => {
      websiteFindFirst.mockResolvedValue(null);
      businessFindUnique.mockResolvedValue({
        id: businessId,
        name: 'Biz 1',
        slug: 'biz-1',
      });
      websiteFindUnique.mockResolvedValue(null);
      themeFindUnique.mockResolvedValue(null);

      await expect(service.create(businessId, createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should create website and 7 default pages in a transaction', async () => {
      websiteFindFirst.mockResolvedValue(null);
      businessFindUnique.mockResolvedValue({
        id: businessId,
        name: 'Biz 1',
        slug: 'biz-1',
      });
      websiteFindUnique.mockResolvedValue(null);
      themeFindUnique.mockResolvedValue({ id: themeId, name: 'Modern' });

      const mockWebRecord = {
        id: 'new-web-id',
        businessId,
        themeId,
        subdomain: 'custom-sub',
      };
      websiteCreate.mockResolvedValue(mockWebRecord);
      pageCreate.mockResolvedValue({ id: 'page-id' });

      const result = await service.create(businessId, createDto);

      expect(result).toEqual(mockWebRecord);
      expect(websiteCreate).toHaveBeenCalledWith({
        data: {
          businessId,
          themeId,
          subdomain: 'custom-sub',
          isPublished: false,
        },
      });
      expect(pageCreate).toHaveBeenCalledTimes(7);
    });
  });

  describe('findOneByBusiness', () => {
    it('should throw NotFoundException if website does not exist', async () => {
      websiteFindFirst.mockResolvedValue(null);
      await expect(service.findOneByBusiness(businessId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return website details including theme and pages', async () => {
      const mockWebRecord = { id: 'web-id', businessId, themeId };
      websiteFindFirst.mockResolvedValue(mockWebRecord);

      const result = await service.findOneByBusiness(businessId);
      expect(result).toEqual(mockWebRecord);
    });
  });

  describe('update', () => {
    const updateDto = { subdomain: 'new-sub', isPublished: true };

    it('should update website settings successfully', async () => {
      const mockWebRecord = {
        id: 'web-id',
        businessId,
        themeId,
        subdomain: 'old-sub',
      };
      websiteFindFirst.mockResolvedValue(mockWebRecord);
      websiteFindUnique.mockResolvedValue(null); // No subdomain duplicate
      websiteUpdate.mockResolvedValue({
        ...mockWebRecord,
        subdomain: 'new-sub',
        isPublished: true,
      });

      const result = await service.update(businessId, updateDto);
      expect(result.subdomain).toEqual('new-sub');
      expect(result.isPublished).toEqual(true);
    });

    it('should throw ConflictException if updating to an already taken subdomain', async () => {
      const mockWebRecord = {
        id: 'web-id',
        businessId,
        themeId,
        subdomain: 'old-sub',
      };
      websiteFindFirst.mockResolvedValue(mockWebRecord);
      websiteFindUnique.mockResolvedValue({ id: 'other-web-id' }); // Subdomain already taken

      await expect(service.update(businessId, updateDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('should cascade soft delete of pages and website inside a transaction', async () => {
      const mockWebRecord = { id: 'web-id', businessId, themeId };
      websiteFindFirst.mockResolvedValue(mockWebRecord);
      pageUpdateMany.mockResolvedValue({ count: 7 });
      websiteUpdate.mockResolvedValue({
        ...mockWebRecord,
        deletedAt: new Date(),
      });

      const result = await service.remove(businessId);
      expect(result.deletedAt).toBeDefined();
      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      expect(pageUpdateMany).toHaveBeenCalledWith({
        where: { websiteId: 'web-id', deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
      expect(websiteUpdate).toHaveBeenCalledWith({
        where: { id: 'web-id' },
        data: { deletedAt: expect.any(Date) },
      });
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    });
  });
});
