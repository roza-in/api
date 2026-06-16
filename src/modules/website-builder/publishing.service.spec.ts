import { Test, TestingModule } from '@nestjs/testing';
import { PublishingService } from './publishing.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('PublishingService', () => {
  let service: PublishingService;

  const websiteFindFirst = jest.fn();
  const businessFindUnique = jest.fn();
  const serviceFindFirst = jest.fn();
  const pageFindFirst = jest.fn();
  const pageFindMany = jest.fn();
  const websiteVersionCreate = jest.fn();
  const websiteUpdate = jest.fn();
  const websiteVersionFindFirst = jest.fn();
  const websiteVersionFindMany = jest.fn();
  const pageUpdateMany = jest.fn();
  const pageCreate = jest.fn();

  const mockPrisma = {
    website: {
      findFirst: websiteFindFirst,
      update: websiteUpdate,
    },
    business: {
      findUnique: businessFindUnique,
    },
    service: {
      findFirst: serviceFindFirst,
    },
    page: {
      findFirst: pageFindFirst,
      findMany: pageFindMany,
      updateMany: pageUpdateMany,
      create: pageCreate,
    },
    websiteVersion: {
      create: websiteVersionCreate,
      findFirst: websiteVersionFindFirst,
      findMany: websiteVersionFindMany,
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublishingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PublishingService>(PublishingService);
    jest.clearAllMocks();
  });

  const businessId = 'business-uuid-1';
  const websiteId = 'website-uuid-1';
  const themeId = 'theme-uuid-1';

  describe('publish', () => {
    it('should throw NotFoundException if website config is not found', async () => {
      websiteFindFirst.mockResolvedValue(null);

      await expect(service.publish(businessId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if business is not found', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      businessFindUnique.mockResolvedValue(null);

      await expect(service.publish(businessId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if business has no active services', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      businessFindUnique.mockResolvedValue({ id: businessId });
      serviceFindFirst.mockResolvedValue(null);

      await expect(service.publish(businessId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if no contact info is set', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      businessFindUnique.mockResolvedValue({
        id: businessId,
        email: null,
        phone: null,
      });
      serviceFindFirst.mockResolvedValue({ id: 'service-id' });
      pageFindFirst.mockResolvedValue(null);

      await expect(service.publish(businessId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if no theme is assigned', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId, themeId: null });
      businessFindUnique.mockResolvedValue({
        id: businessId,
        email: 'info@biz.com',
      });
      serviceFindFirst.mockResolvedValue({ id: 'service-id' });
      pageFindFirst.mockResolvedValue({ id: 'contact-page-id' });

      await expect(service.publish(businessId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if no pages exist', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId, themeId });
      businessFindUnique.mockResolvedValue({
        id: businessId,
        email: 'info@biz.com',
      });
      serviceFindFirst.mockResolvedValue({ id: 'service-id' });
      pageFindMany.mockResolvedValue([]);

      await expect(service.publish(businessId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully publish and generate a version record', async () => {
      websiteFindFirst.mockResolvedValue({
        id: websiteId,
        themeId,
        publishedVersion: 2,
      });
      businessFindUnique.mockResolvedValue({
        id: businessId,
        name: 'Glow Studio',
        email: 'info@biz.com',
      });
      serviceFindFirst.mockResolvedValue({ id: 'service-id' });
      pageFindMany.mockResolvedValue([
        {
          title: 'Home',
          slug: 'home',
          type: 'home',
          contentJson: {},
          isPublished: true,
        },
      ]);
      websiteVersionCreate.mockResolvedValue({
        id: 'version-rec-id',
        version: 3,
      });
      websiteUpdate.mockResolvedValue({
        id: websiteId,
        isPublished: true,
        publishedVersion: 3,
      });

      const result = await service.publish(businessId);

      expect(websiteVersionCreate).toHaveBeenCalledWith({
        data: {
          websiteId,
          version: 3,
          themeId,
          pagesJson: [
            {
              title: 'Home',
              slug: 'home',
              type: 'home',
              contentJson: {},
              isPublished: true,
              seoTitle: undefined,
              seoDescription: undefined,
              seoOgImage: undefined,
            },
          ],
        },
      });

      expect(websiteUpdate).toHaveBeenCalledWith({
        where: { id: websiteId },
        data: { isPublished: true, publishedVersion: 3 },
      });

      expect(result.website.isPublished).toBe(true);
      expect(result.website.publishedVersion).toBe(3);
    });
  });

  describe('rollback', () => {
    it('should throw NotFoundException if website does not exist', async () => {
      websiteFindFirst.mockResolvedValue(null);

      await expect(service.rollback(businessId, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if target version record is not found', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      websiteVersionFindFirst.mockResolvedValue(null);

      await expect(service.rollback(businessId, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should successfully soft-delete active pages and recreate pages from snapshot', async () => {
      websiteFindFirst.mockResolvedValue({
        id: websiteId,
        publishedVersion: 3,
      });
      websiteVersionFindFirst.mockResolvedValue({
        id: 'version-rec-id',
        version: 1,
        themeId: 'old-theme-id',
        pagesJson: [
          {
            title: 'Home v1',
            slug: 'home',
            type: 'home',
            contentJson: { hero: 'text' },
            isPublished: true,
            seoTitle: 'SEO Home',
          },
        ],
      });

      await service.rollback(businessId, 1);

      expect(pageUpdateMany).toHaveBeenCalledWith({
        where: { websiteId, deletedAt: null },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: { deletedAt: expect.any(Date) },
      });

      expect(pageCreate).toHaveBeenCalledWith({
        data: {
          websiteId,
          title: 'Home v1',
          slug: 'home',
          type: 'home',
          contentJson: { hero: 'text' },
          isPublished: true,
          seoTitle: 'SEO Home',
          seoDescription: null,
          seoOgImage: null,
        },
      });

      expect(websiteUpdate).toHaveBeenCalledWith({
        where: { id: websiteId },
        data: {
          themeId: 'old-theme-id',
          publishedVersion: 1,
          isPublished: true,
        },
      });
    });
  });

  describe('getPublishHistory', () => {
    it('should return version list ordered by version number desc', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      const mockVersions = [
        { version: 2, createdAt: new Date() },
        { version: 1, createdAt: new Date() },
      ];
      websiteVersionFindMany.mockResolvedValue(mockVersions);

      const result = await service.getPublishHistory(businessId);
      expect(result).toEqual(mockVersions);
      expect(websiteVersionFindMany).toHaveBeenCalledWith({
        where: { websiteId },
        orderBy: { version: 'desc' },
      });
    });
  });
});
