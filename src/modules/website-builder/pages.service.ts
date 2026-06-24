import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePageDto } from './dto/update-page.dto';
import { CreatePageDto } from './dto/create-page.dto';
import { Prisma } from '../../generated/prisma';

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService) {}

  private async getBusinessWebsiteId(businessId: string): Promise<string> {
    const website = await this.prisma.website.findFirst({
      where: { businessId, deletedAt: null },
    });

    if (!website) {
      throw new NotFoundException(
        'Website configuration not found for this business',
      );
    }

    return website.id;
  }

  async findAll(businessId: string) {
    const websiteId = await this.getBusinessWebsiteId(businessId);
    return this.prisma.page.findMany({
      where: { websiteId, deletedAt: null },
    });
  }

  async findOne(businessId: string, pageId: string) {
    const websiteId = await this.getBusinessWebsiteId(businessId);
    const page = await this.prisma.page.findFirst({
      where: { id: pageId, websiteId, deletedAt: null },
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    return page;
  }

  async findBySlug(businessId: string, slug: string) {
    const websiteId = await this.getBusinessWebsiteId(businessId);
    const page = await this.prisma.page.findFirst({
      where: { slug, websiteId, deletedAt: null },
    });

    if (!page) {
      throw new NotFoundException(`Page with slug "${slug}" not found`);
    }

    return page;
  }

  async update(businessId: string, pageId: string, dto: UpdatePageDto) {
    const websiteId = await this.getBusinessWebsiteId(businessId);

    // Verify page exists and belongs to this business's website
    const page = await this.prisma.page.findFirst({
      where: { id: pageId, websiteId, deletedAt: null },
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const data: Prisma.PageUpdateInput = {};

    if (dto.title !== undefined) {
      data.title = dto.title;
    }

    if (dto.slug !== undefined && dto.slug !== page.slug) {
      // Check slug uniqueness within the same website
      const duplicateSlug = await this.prisma.page.findFirst({
        where: {
          websiteId,
          slug: dto.slug,
          deletedAt: null,
          NOT: { id: pageId },
        },
      });

      if (duplicateSlug) {
        throw new ConflictException(
          `A page with slug "${dto.slug}" already exists on your website`,
        );
      }
      data.slug = dto.slug;
    }

    if (dto.contentJson !== undefined) {
      data.contentJson = dto.contentJson as Prisma.InputJsonValue;
    }

    if (dto.seoTitle !== undefined) {
      data.seoTitle = dto.seoTitle;
    }

    if (dto.seoDescription !== undefined) {
      data.seoDescription = dto.seoDescription;
    }

    if (dto.seoOgImage !== undefined) {
      data.seoOgImage = dto.seoOgImage;
    }

    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }

    if (dto.isPublished !== undefined) {
      data.isPublished = dto.isPublished;
    }

    return this.prisma.page.update({
      where: { id: pageId },
      data,
    });
  }

  async create(businessId: string, dto: CreatePageDto) {
    const websiteId = await this.getBusinessWebsiteId(businessId);

    const existing = await this.prisma.page.findFirst({
      where: { websiteId, slug: dto.slug, deletedAt: null },
    });

    if (existing) {
      throw new ConflictException(
        `A page with slug "${dto.slug}" already exists on your website`,
      );
    }

    return this.prisma.page.create({
      data: {
        websiteId,
        title: dto.title,
        slug: dto.slug,
        type: 'custom',
        seoTitle: dto.title,
        seoDescription: dto.seoDescription || '',
        contentJson: [],
        isPublished: true,
      },
    });
  }

  async remove(businessId: string, pageId: string) {
    const websiteId = await this.getBusinessWebsiteId(businessId);

    const page = await this.prisma.page.findFirst({
      where: { id: pageId, websiteId, deletedAt: null },
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const corePages = [
      'home',
      'services',
      'about',
      'contact',
      'privacy-policy',
      'terms-and-conditions',
    ];
    if (corePages.includes(page.slug)) {
      throw new ConflictException(
        `Cannot delete core system page: ${page.slug}`,
      );
    }

    return this.prisma.page.update({
      where: { id: pageId },
      data: { deletedAt: new Date() },
    });
  }
}
