import { Test, TestingModule } from '@nestjs/testing';
import { MediaAssetsService } from './media-assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

describe('MediaAssetsService', () => {
  let service: MediaAssetsService;

  const websiteFindFirst = jest.fn();
  const mediaAssetCreate = jest.fn();
  const mediaAssetFindMany = jest.fn();
  const mediaAssetFindUnique = jest.fn();
  const mediaAssetUpdate = jest.fn();
  const storageUploadFile = jest.fn();

  const mockPrisma = {
    website: {
      findFirst: websiteFindFirst,
    },
    mediaAsset: {
      create: mediaAssetCreate,
      findMany: mediaAssetFindMany,
      findUnique: mediaAssetFindUnique,
      update: mediaAssetUpdate,
    },
  };

  const mockStorageService = {
    uploadFile: storageUploadFile,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaAssetsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<MediaAssetsService>(MediaAssetsService);
    jest.clearAllMocks();
  });

  const businessId = 'business-uuid-1';
  const assetId = 'asset-uuid-1';

  describe('upload', () => {
    const file = {
      buffer: Buffer.from('test-image'),
      originalname: 'logo.png',
      mimetype: 'image/png',
      size: 1024,
    };

    it('should throw BadRequestException if no file is provided', async () => {
      await expect(
        service.upload(
          businessId,
          null as unknown as {
            buffer: Buffer;
            originalname: string;
            mimetype: string;
            size: number;
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upload file and save media asset configuration log', async () => {
      websiteFindFirst.mockResolvedValue({ id: 'web-uuid' });
      storageUploadFile.mockResolvedValue('https://cdn.rozx.in/mock-s3-key');
      mediaAssetCreate.mockResolvedValue({
        id: assetId,
        fileUrl: 'https://cdn.rozx.in/mock-s3-key',
      });

      const result = await service.upload(businessId, file, 'Logo');
      expect(result.fileUrl).toEqual('https://cdn.rozx.in/mock-s3-key');
      expect(storageUploadFile).toHaveBeenCalledWith(businessId, file);
      expect(mediaAssetCreate).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should find all active media assets for the business', async () => {
      mediaAssetFindMany.mockResolvedValue([{ id: '1' }, { id: '2' }]);
      const result = await service.findAll(businessId);
      expect(result).toHaveLength(2);
      expect(mediaAssetFindMany).toHaveBeenCalledWith({
        where: { businessId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException if media asset does not exist', async () => {
      mediaAssetFindUnique.mockResolvedValue(null);
      await expect(service.remove(businessId, assetId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if asset belongs to another business', async () => {
      mediaAssetFindUnique.mockResolvedValue({
        id: assetId,
        businessId: 'other-biz',
        deletedAt: null,
      });
      await expect(service.remove(businessId, assetId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should soft delete media asset successfully', async () => {
      mediaAssetFindUnique.mockResolvedValue({
        id: assetId,
        businessId,
        deletedAt: null,
      });
      mediaAssetUpdate.mockResolvedValue({
        id: assetId,
        deletedAt: new Date(),
      });

      const result = await service.remove(businessId, assetId);
      expect(result.deletedAt).toBeDefined();
    });
  });
});
