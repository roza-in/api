import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma';

@Injectable()
export class PublishingService {
  constructor(private readonly prisma: PrismaService) {}

  async publish(businessId: string) {
    // 1. Fetch website configuration
    const website = await this.prisma.website.findFirst({
      where: { businessId, deletedAt: null },
      include: { theme: true },
    });

    if (!website) {
      throw new NotFoundException('Website configuration not found');
    }

    // 2. Fetch business
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // 3. Validation: At least one active service
    const activeService = await this.prisma.service.findFirst({
      where: { businessId, isActive: true, deletedAt: null },
    });

    if (!activeService) {
      throw new BadRequestException(
        'At least one active service is required to publish the website',
      );
    }

    // 4. Validation: Contact info is configured
    const contactPage = await this.prisma.page.findFirst({
      where: { websiteId: website.id, type: 'contact', deletedAt: null },
    });

    const hasContactInfo = business.email || business.phone || contactPage;

    if (!hasContactInfo) {
      throw new BadRequestException(
        'Contact info (email, phone, or contact page) is required to publish the website',
      );
    }

    // 5. Validation: Theme is assigned
    if (!website.themeId) {
      throw new BadRequestException('Theme must be assigned to the website');
    }

    // 6. Fetch current active pages
    const pages = await this.prisma.page.findMany({
      where: { websiteId: website.id, deletedAt: null },
    });

    if (pages.length === 0) {
      throw new BadRequestException(
        'Website must have at least one page to publish',
      );
    }

    // 7. Execute Transaction: Save snapshot & increment version
    const nextVersion = website.publishedVersion + 1;

    // Map pages to a clean serializable snapshot
    const pagesSnapshot = pages.map((page) => ({
      title: page.title,
      slug: page.slug,
      type: page.type,
      contentJson: page.contentJson,
      isPublished: page.isPublished,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      seoOgImage: page.seoOgImage,
    }));

    return this.prisma.$transaction(async (tx) => {
      // Create version record
      const versionRecord = await tx.websiteVersion.create({
        data: {
          websiteId: website.id,
          version: nextVersion,
          pagesJson: pagesSnapshot,
          themeId: website.themeId,
        },
      });

      // Update website published state
      const updatedWebsite = await tx.website.update({
        where: { id: website.id },
        data: {
          isPublished: true,
          publishedVersion: nextVersion,
        },
      });

      return {
        website: updatedWebsite,
        version: versionRecord,
      };
    });
  }

  async rollback(businessId: string, versionNumber: number) {
    // 1. Fetch website
    const website = await this.prisma.website.findFirst({
      where: { businessId, deletedAt: null },
    });

    if (!website) {
      throw new NotFoundException('Website configuration not found');
    }

    // 2. Fetch target version record
    const targetVersion = await this.prisma.websiteVersion.findFirst({
      where: { websiteId: website.id, version: versionNumber },
    });

    if (!targetVersion) {
      throw new NotFoundException(`Website version ${versionNumber} not found`);
    }

    const pagesSnapshot = targetVersion.pagesJson as unknown as Array<{
      title: string;
      slug: string;
      type: string;
      contentJson: Prisma.InputJsonValue;
      isPublished: boolean;
      seoTitle?: string;
      seoDescription?: string;
      seoOgImage?: string;
    }>;

    // 3. Execute transactional rollback
    return this.prisma.$transaction(async (tx) => {
      // Soft-delete current active pages
      await tx.page.updateMany({
        where: { websiteId: website.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      // Recreate pages from snapshot
      for (const pageSnap of pagesSnapshot) {
        await tx.page.create({
          data: {
            websiteId: website.id,
            title: pageSnap.title,
            slug: pageSnap.slug,
            type: pageSnap.type,
            contentJson: pageSnap.contentJson,
            isPublished: pageSnap.isPublished,
            seoTitle: pageSnap.seoTitle || null,
            seoDescription: pageSnap.seoDescription || null,
            seoOgImage: pageSnap.seoOgImage || null,
          },
        });
      }

      // Update website's theme and publishedVersion references
      const updatedWebsite = await tx.website.update({
        where: { id: website.id },
        data: {
          themeId: targetVersion.themeId,
          publishedVersion: versionNumber,
          isPublished: true,
        },
      });

      return updatedWebsite;
    });
  }

  async getPublishHistory(businessId: string) {
    const website = await this.prisma.website.findFirst({
      where: { businessId, deletedAt: null },
    });

    if (!website) {
      throw new NotFoundException('Website configuration not found');
    }

    return this.prisma.websiteVersion.findMany({
      where: { websiteId: website.id },
      orderBy: { version: 'desc' },
    });
  }
}
