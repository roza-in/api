import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWebsiteDto } from './dto/create-website.dto';
import { UpdateWebsiteDto } from './dto/update-website.dto';
import { Prisma } from '../../generated/prisma';

@Injectable()
export class WebsitesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(businessId: string, dto: CreateWebsiteDto) {
    // 1. Enforce single website per business check
    const existingWebsite = await this.prisma.website.findFirst({
      where: { businessId, deletedAt: null },
    });

    if (existingWebsite) {
      throw new ConflictException(
        'A website configuration already exists for this business',
      );
    }

    // 2. Fetch business to get default slug
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // 3. Resolve subdomain
    const subdomain = dto.subdomain || business.slug;

    // Check subdomain uniqueness globally
    const duplicateSubdomain = await this.prisma.website.findUnique({
      where: { subdomain },
    });

    if (duplicateSubdomain) {
      throw new ConflictException(`Subdomain "${subdomain}" is already taken`);
    }

    // 4. Resolve theme
    const theme = await this.prisma.theme.findUnique({
      where: { id: dto.themeId },
    });

    if (!theme) {
      throw new NotFoundException('Selected theme not found');
    }

    // 5. Execute transaction to create website and 7 default pages
    return this.prisma.$transaction(async (tx) => {
      const website = await tx.website.create({
        data: {
          businessId,
          themeId: dto.themeId,
          subdomain,
          isPublished: false,
        },
      });

      // Seeding default pages layout structures
      const defaultPages = [
        {
          title: 'Home',
          slug: 'home',
          type: 'home',
          contentJson: [
            {
              id: 'hero-1',
              type: 'hero',
              title: `Welcome to ${business.name}`,
              subtitle: 'Book your service online today.',
              buttonText: 'Book Now',
            },
            {
              id: 'features-1',
              type: 'features',
              title: 'Why Choose Us',
              items: [
                'Professional Staff',
                'Premium Products',
                'Comfortable Ambience',
              ],
            },
          ],
        },
        {
          title: 'Services',
          slug: 'services',
          type: 'services',
          contentJson: [
            {
              id: 'services-header-1',
              type: 'header',
              title: 'Our Services',
              description: 'Explore our catalog of professional services',
            },
          ],
        },
        {
          title: 'Staff',
          slug: 'staff',
          type: 'staff',
          contentJson: [
            {
              id: 'staff-header-1',
              type: 'header',
              title: 'Meet Our Team',
              description: 'Dedicated professionals at your service',
            },
          ],
        },
        {
          title: 'About Us',
          slug: 'about',
          type: 'about',
          contentJson: [
            {
              id: 'about-text-1',
              type: 'text-block',
              title: 'Our Story',
              text: 'We are committed to delivering the best grooming and wellness experience.',
            },
          ],
        },
        {
          title: 'Contact',
          slug: 'contact',
          type: 'contact',
          contentJson: [
            {
              id: 'contact-info-1',
              type: 'contact-details',
              title: 'Visit Us',
              email: business.email || '',
              phone: business.phone || '',
            },
          ],
        },
        {
          title: 'Reviews',
          slug: 'reviews',
          type: 'reviews',
          contentJson: [
            {
              id: 'reviews-header-1',
              type: 'header',
              title: 'Customer Reviews',
              description: 'What our clients say about us',
            },
          ],
        },
        {
          title: 'Policies',
          slug: 'policies',
          type: 'policies',
          contentJson: [
            {
              id: 'policies-text-1',
              type: 'text-block',
              title: 'Booking Policies',
              text: 'Please reschedule or cancel at least 24 hours prior to your slot.',
            },
          ],
        },
      ];

      for (const page of defaultPages) {
        await tx.page.create({
          data: {
            websiteId: website.id,
            title: page.title,
            slug: page.slug,
            type: page.type,
            contentJson: page.contentJson,
            isPublished: true, // Default to true so they are live when the site is published
            seoTitle: `${page.title} | ${business.name}`,
            seoDescription: `Welcome to the ${page.title} page of ${business.name}.`,
          },
        });
      }

      return website;
    });
  }

  async findOneByBusiness(businessId: string) {
    const website = await this.prisma.website.findFirst({
      where: { businessId, deletedAt: null },
      include: {
        theme: true,
        pages: true,
      },
    });

    if (!website) {
      throw new NotFoundException('Website configuration not found');
    }

    return website;
  }

  async update(businessId: string, dto: UpdateWebsiteDto) {
    const website = await this.findOneByBusiness(businessId);

    const data: Prisma.WebsiteUpdateInput = {};

    if (dto.themeId !== undefined) {
      const theme = await this.prisma.theme.findUnique({
        where: { id: dto.themeId },
      });
      if (!theme) {
        throw new NotFoundException('Theme not found');
      }
      data.theme = { connect: { id: dto.themeId } };
    }

    if (dto.subdomain !== undefined && dto.subdomain !== website.subdomain) {
      const duplicate = await this.prisma.website.findUnique({
        where: { subdomain: dto.subdomain },
      });
      if (duplicate) {
        throw new ConflictException(
          `Subdomain "${dto.subdomain}" is already taken`,
        );
      }
      data.subdomain = dto.subdomain;
    }

    if (dto.customDomain !== undefined) {
      if (
        dto.customDomain !== null &&
        dto.customDomain !== website.customDomain
      ) {
        const duplicate = await this.prisma.website.findUnique({
          where: { customDomain: dto.customDomain },
        });
        if (duplicate) {
          throw new ConflictException(
            `Custom domain "${dto.customDomain}" is already mapped`,
          );
        }
      }
      data.customDomain = dto.customDomain;
    }

    if (dto.isPublished !== undefined) {
      data.isPublished = dto.isPublished;
    }

    return this.prisma.website.update({
      where: { id: website.id },
      data,
    });
  }

  async remove(businessId: string) {
    const website = await this.findOneByBusiness(businessId);

    // Cascade soft delete of pages
    return this.prisma.$transaction(async (tx) => {
      await tx.page.updateMany({
        where: { websiteId: website.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      return tx.website.update({
        where: { id: website.id },
        data: { deletedAt: new Date() },
      });
    });
  }

  async generateSitemap(slug: string): Promise<string> {
    const business = await this.prisma.business.findUnique({
      where: { slug },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const website = await this.prisma.website.findFirst({
      where: { businessId: business.id, deletedAt: null },
    });

    if (!website) {
      throw new NotFoundException('Website not found');
    }

    const pages = await this.prisma.page.findMany({
      where: { websiteId: website.id, isPublished: true, deletedAt: null },
    });

    const baseUrl = website.customDomain
      ? `https://${website.customDomain}`
      : `https://${website.subdomain}.rozx.in`;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (const page of pages) {
      const loc = page.slug === 'home' ? baseUrl : `${baseUrl}/${page.slug}`;
      const lastmod = (page.updatedAt || new Date())
        .toISOString()
        .split('T')[0];
      xml += `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>\n`;
    }
    xml += `</urlset>`;

    return xml;
  }

  async generateRobots(slug: string): Promise<string> {
    const business = await this.prisma.business.findUnique({
      where: { slug },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const website = await this.prisma.website.findFirst({
      where: { businessId: business.id, deletedAt: null },
    });

    if (!website) {
      throw new NotFoundException('Website not found');
    }

    const baseUrl = website.customDomain
      ? `https://${website.customDomain}`
      : `https://${website.subdomain}.rozx.in`;

    return `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
  }
}
