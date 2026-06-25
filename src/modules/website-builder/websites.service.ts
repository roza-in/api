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
          sortOrder: 1,
          contentJson: [
            {
              id: 'hero-1',
              type: 'hero',
              title: `Welcome to ${business.name}`,
              subtitle:
                'Experience premium treatments by certified professionals in a luxury sanctuary.',
              buttonText: 'Book Appointment Now',
              imageUrl:
                'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1000',
            },
            {
              id: 'features-1',
              type: 'features',
              title: 'Why Choose Our Sanctuary',
              items: [
                'Certified Professionals & Stylists',
                '100% Toxic-Free & Organic Products',
                'Ultra-Hygienic & Premium Luxury Environment',
              ],
            },
            {
              id: 'about-1',
              type: 'about',
              title: 'Our Story & Vision',
              subtitle: 'Crafting beautiful experiences since 2018',
              content:
                'We believe in holistic wellness and modern beauty treatments. Our team of certified professional stylists and therapist experts are dedicated to pampering you and providing a personalized care program.',
              imageUrl:
                'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=1000',
            },
            {
              id: 'services-1',
              type: 'services',
              title: 'Our Signature Treatments',
              subtitle:
                'Choose from our wide selection of hair, skin, spa, and beauty packages.',
            },
            {
              id: 'reviews-1',
              type: 'reviews',
              title: 'What Our Clients Say',
              subtitle:
                'Read feedback from verified appointments and salon regulars.',
              items: [
                {
                  name: 'Ananya Iyer',
                  rating: 5,
                  comment:
                    'Absolutely stellar haircut and coloring session. Staff is extremely gentle and professional!',
                },
                {
                  name: 'Vikram Sen',
                  rating: 5,
                  comment:
                    'Very clean spa space and relaxing massage. The online booking confirmation via WhatsApp is very convenient.',
                },
              ],
            },
            {
              id: 'contact-1',
              type: 'contact',
              title: 'Visit Our Salon',
              subtitle:
                'Address details, opening schedule, and inquiry helpline.',
            },
          ],
        },
        {
          title: 'Services',
          slug: 'services',
          type: 'services',
          sortOrder: 2,
          contentJson: [
            {
              id: 'services-list-1',
              type: 'services',
              title: 'Our Signature Treatments',
              subtitle:
                'Choose from our wide selection of hair, skin, spa, and beauty packages.',
            },
          ],
        },
        {
          title: 'About',
          slug: 'about',
          type: 'about',
          sortOrder: 3,
          contentJson: [
            {
              id: 'about-panel-1',
              type: 'about',
              title: 'Our Story & Vision',
              subtitle: 'Crafting beautiful experiences since 2018',
              content:
                'We believe in holistic wellness and modern beauty treatments. Our team of certified professional stylists and therapist experts are dedicated to pampering you and providing a personalized care program.',
              imageUrl:
                'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=1000',
            },
          ],
        },
        {
          title: 'Contact',
          slug: 'contact',
          type: 'contact',
          sortOrder: 4,
          contentJson: [
            {
              id: 'contact-info-1',
              type: 'contact',
              title: 'Visit Our Salon',
              subtitle:
                'Address details, opening schedule, and inquiry helpline.',
            },
          ],
        },
        {
          title: 'Privacy Policy',
          slug: 'privacy-policy',
          type: 'privacy-policy',
          sortOrder: 5,
          contentJson: [
            {
              id: 'privacy-policy-text',
              type: 'text-block',
              title: 'Privacy Policy',
              text: 'We value your privacy. This policy outlines how we collect and use your data.',
            },
          ],
        },
        {
          title: 'Terms & Conditions',
          slug: 'terms-and-conditions',
          type: 'terms-and-conditions',
          sortOrder: 6,
          contentJson: [
            {
              id: 'terms-and-conditions-text',
              type: 'text-block',
              title: 'Terms & Conditions',
              text: 'By booking with us, you agree to our terms and conditions.',
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
            sortOrder: page.sortOrder,
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
        pages: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
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

    if (dto.faviconUrl !== undefined) {
      data.faviconUrl = dto.faviconUrl;
    }

    if (dto.logoAltText !== undefined) {
      data.logoAltText = dto.logoAltText;
    }

    if (dto.logoUrl !== undefined) {
      data.logoUrl = dto.logoUrl;
      // Sync logoUrl with Business model
      await this.prisma.business.update({
        where: { id: businessId },
        data: { logoUrl: dto.logoUrl },
      });
    }

    if (dto.socialLinks !== undefined) {
      // Merge with existing social links so partial updates don't wipe other platforms
      const existing =
        (website.socialLinksJson as Record<string, string> | null) ?? {};
      data.socialLinksJson = { ...existing, ...dto.socialLinks };
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

  async validateDomain(domain: string): Promise<boolean> {
    if (!domain) {
      return false;
    }

    const lowerDomain = domain.toLowerCase();

    // 1. Allow core system domains
    const systemDomains = [
      'rozx.in',
      'staging.rozx.in',
      'app.rozx.in',
      'staging.app.rozx.in',
      'admin.rozx.in',
      'staging.admin.rozx.in',
      'api.rozx.in',
      'staging.api.rozx.in',
    ];

    if (systemDomains.includes(lowerDomain)) {
      return true;
    }

    // 2. Check if it's a subdomain of staging.rozx.in or rozx.in
    let subdomain: string | null = null;
    if (lowerDomain.endsWith('.staging.rozx.in')) {
      subdomain = lowerDomain.replace('.staging.rozx.in', '');
    } else if (lowerDomain.endsWith('.rozx.in')) {
      subdomain = lowerDomain.replace('.rozx.in', '');
    }

    if (subdomain) {
      const website = await this.prisma.website.findUnique({
        where: { subdomain },
      });
      if (website && !website.deletedAt) {
        return true;
      }
    }

    // 3. Check if it matches an active custom domain in the websites or domains table
    const websiteWithCustom = await this.prisma.website.findFirst({
      where: {
        customDomain: lowerDomain,
        domainStatus: 'ACTIVE',
        deletedAt: null,
      },
    });

    if (websiteWithCustom) {
      return true;
    }

    const domainRecord = await this.prisma.domain.findFirst({
      where: {
        hostname: lowerDomain,
        status: 'ACTIVE',
        deletedAt: null,
      },
    });

    if (domainRecord) {
      return true;
    }

    return false;
  }
}
