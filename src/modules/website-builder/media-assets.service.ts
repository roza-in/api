import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class MediaAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async upload(
    businessId: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    altText?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Verify business has a website configuration
    const website = await this.prisma.website.findFirst({
      where: { businessId, deletedAt: null },
    });

    // Upload using StorageService
    const fileUrl = await this.storageService.uploadFile(businessId, file);

    // Create database log record
    return this.prisma.mediaAsset.create({
      data: {
        businessId,
        websiteId: website?.id || null, // Optional connection
        fileName: file.originalname,
        fileUrl,
        fileType: file.mimetype,
        sizeBytes: file.size,
        altText,
      },
    });
  }

  async findAll(businessId: string) {
    return this.prisma.mediaAsset.findMany({
      where: { businessId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(businessId: string, assetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });

    if (!asset || asset.deletedAt !== null) {
      throw new NotFoundException('Media asset not found');
    }

    if (asset.businessId !== businessId) {
      throw new ForbiddenException(
        'You do not have access to this media asset',
      );
    }

    return this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: { deletedAt: new Date() },
    });
  }
}
