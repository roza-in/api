import { Test, TestingModule } from '@nestjs/testing';
import { PagesService } from './pages.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('PagesService', () => {
  let service: PagesService;

  const websiteFindFirst = jest.fn();
  const pageFindMany = jest.fn();
  const pageFindFirst = jest.fn();
  const pageUpdate = jest.fn();

  const mockPrisma = {
    website: {
      findFirst: websiteFindFirst,
    },
    page: {
      findMany: pageFindMany,
      findFirst: pageFindFirst,
      update: pageUpdate,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PagesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PagesService>(PagesService);
    jest.clearAllMocks();
  });

  const businessId = 'business-uuid-1';
  const websiteId = 'website-uuid-1';
  const pageId = 'page-uuid-1';

  describe('findAll', () => {
    it('should throw NotFoundException if website does not exist', async () => {
      websiteFindFirst.mockResolvedValue(null);
      await expect(service.findAll(businessId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return all pages for the business website', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      const mockPages = [
        { id: '1', slug: 'home' },
        { id: '2', slug: 'about' },
      ];
      pageFindMany.mockResolvedValue(mockPages);

      const result = await service.findAll(businessId);
      expect(result).toEqual(mockPages);
      expect(pageFindMany).toHaveBeenCalledWith({
        where: { websiteId, deletedAt: null },
      });
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if page is not found', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      pageFindFirst.mockResolvedValue(null);

      await expect(service.findOne(businessId, pageId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return page details if found', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      const mockPage = { id: pageId, slug: 'home', title: 'Home' };
      pageFindFirst.mockResolvedValue(mockPage);

      const result = await service.findOne(businessId, pageId);
      expect(result).toEqual(mockPage);
      expect(pageFindFirst).toHaveBeenCalledWith({
        where: { id: pageId, websiteId, deletedAt: null },
      });
    });
  });

  describe('findBySlug', () => {
    it('should throw NotFoundException if page with slug is not found', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      pageFindFirst.mockResolvedValue(null);

      await expect(
        service.findBySlug(businessId, 'unknown-slug'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return page details if slug matches', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      const mockPage = { id: pageId, slug: 'about', title: 'About' };
      pageFindFirst.mockResolvedValue(mockPage);

      const result = await service.findBySlug(businessId, 'about');
      expect(result).toEqual(mockPage);
    });
  });

  describe('update', () => {
    const updateDto = { title: 'New About Us Title', slug: 'new-about' };

    it('should throw NotFoundException if page to update is not found', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      pageFindFirst.mockResolvedValue(null);

      await expect(
        service.update(businessId, pageId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if updated slug already exists in website', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      pageFindFirst
        .mockResolvedValueOnce({ id: pageId, slug: 'about' }) // First call: find the page
        .mockResolvedValueOnce({ id: 'other-page-id', slug: 'new-about' }); // Second call: duplicate check

      await expect(
        service.update(businessId, pageId, updateDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should update page content successfully', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      pageFindFirst
        .mockResolvedValueOnce({ id: pageId, slug: 'about', title: 'About' }) // First call: find the page
        .mockResolvedValueOnce(null); // Second call: duplicate check (no duplicate)

      const mockUpdatedPage = {
        id: pageId,
        slug: 'new-about',
        title: 'New About Us Title',
      };
      pageUpdate.mockResolvedValue(mockUpdatedPage);

      const result = await service.update(businessId, pageId, updateDto);
      expect(result).toEqual(mockUpdatedPage);
    });
  });
});
