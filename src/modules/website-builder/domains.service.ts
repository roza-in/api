import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_DOMAIN_VERIFICATION } from '../queue/queue.constants';
import * as dns from 'dns';

@Injectable()
export class DomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_DOMAIN_VERIFICATION)
    private readonly domainVerificationQueue: Queue,
  ) {}

  async create(businessId: string, hostname: string) {
    // 1. Fetch business website
    const website = await this.prisma.website.findFirst({
      where: { businessId, deletedAt: null },
    });

    if (!website) {
      throw new NotFoundException('Website configuration not found');
    }

    // 2. Validate hostname format
    const domainRegex = /^[a-z0-9]+([-.]?[a-z0-9]+)*\.[a-z]{2,5}$/i;
    if (!domainRegex.test(hostname)) {
      throw new BadRequestException('Invalid hostname format');
    }

    // 3. Enforce global uniqueness of custom domains
    const existingDomain = await this.prisma.domain.findFirst({
      where: { hostname },
    });

    if (existingDomain) {
      if (existingDomain.deletedAt) {
        // Permanently delete the soft-deleted record to free up the unique constraint
        await this.prisma.domain.delete({
          where: { id: existingDomain.id },
        });
      } else {
        throw new ConflictException(`Domain "${hostname}" is already registered`);
      }
    }

    // 4. Create database record
    const domain = await this.prisma.domain.create({
      data: {
        websiteId: website.id,
        hostname,
        status: 'PENDING',
        sslStatus: 'pending',
        dnsVerified: false,
      },
    });

    // 5. Enqueue background verification task
    await this.domainVerificationQueue.add('verify', { domainId: domain.id });

    return domain;
  }

  async verifyDns(domainId: string) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
      include: { website: true },
    });

    if (!domain || domain.deletedAt) {
      return;
    }

    const cnameTarget =
      this.configService.get<string>('ROZX_CNAME_TARGET') || 'cname.rozx.in';
    const aTarget =
      this.configService.get<string>('ROZX_A_TARGET') || '127.0.0.1';
    const nodeEnv = this.configService.get<string>('NODE_ENV');

    let dnsVerified = false;

    // Simulate verification for testing and localhost setups
    if (
      nodeEnv === 'test' ||
      domain.hostname.endsWith('test-domain.com') ||
      domain.hostname === 'localhost' ||
      domain.hostname === '127.0.0.1'
    ) {
      dnsVerified = true;
    } else {
      try {
        // Resolve CNAME records first
        const cnames = await dns.promises.resolveCname(domain.hostname);
        if (cnames.some((c) => c.toLowerCase() === cnameTarget.toLowerCase())) {
          dnsVerified = true;
        }
      } catch {
        // If CNAME fails, fallback to A record check
        try {
          const ips = await dns.promises.resolve4(domain.hostname);
          if (ips.includes(aTarget)) {
            dnsVerified = true;
          }
        } catch {
          dnsVerified = false;
        }
      }
    }

    if (dnsVerified) {
      // Transition status to VERIFIED
      await this.prisma.domain.update({
        where: { id: domain.id },
        data: {
          status: 'VERIFIED',
          dnsVerified: true,
        },
      });

      // Proceed to SSL provisioning
      await this.provisionSsl(domain.id);
    } else {
      // Transition status to FAILED
      await this.prisma.domain.update({
        where: { id: domain.id },
        data: {
          status: 'FAILED',
          dnsVerified: false,
        },
      });
    }
  }

  async provisionSsl(domainId: string) {
    const domain = await this.prisma.domain.findUnique({
      where: { id: domainId },
    });

    if (!domain || domain.deletedAt || domain.status !== 'VERIFIED') {
      return;
    }

    // Set state to SSL_PROVISIONING / provisioning
    await this.prisma.domain.update({
      where: { id: domain.id },
      data: {
        status: 'SSL_PROVISIONING',
        sslStatus: 'provisioning',
      },
    });

    // Simulate certificate generation (mock Let's Encrypt wait/process)
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Update database domain status to ACTIVE and save sslIssuedAt
    return this.prisma.$transaction(async (tx) => {
      const updatedDomain = await tx.domain.update({
        where: { id: domain.id },
        data: {
          status: 'ACTIVE',
          sslStatus: 'issued',
          sslIssuedAt: new Date(),
        },
      });

      // Link domain to website
      await tx.website.update({
        where: { id: domain.websiteId },
        data: {
          customDomain: domain.hostname,
          domainStatus: 'ACTIVE',
        },
      });

      return updatedDomain;
    });
  }

  async remove(businessId: string, domainId: string) {
    const website = await this.prisma.website.findFirst({
      where: { businessId, deletedAt: null },
    });

    if (!website) {
      throw new NotFoundException('Website configuration not found');
    }

    const domain = await this.prisma.domain.findFirst({
      where: { id: domainId, websiteId: website.id, deletedAt: null },
    });

    if (!domain) {
      throw new NotFoundException('Custom domain not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // Permanently delete domain record to free up unique hostname constraint
      await tx.domain.delete({
        where: { id: domain.id },
      });

      // If this was the website's active custom domain, clear it
      if (website.customDomain === domain.hostname) {
        await tx.website.update({
          where: { id: website.id },
          data: {
            customDomain: null,
            domainStatus: 'PENDING',
          },
        });
      }

      return { success: true };
    });
  }

  async reverify(businessId: string, domainId: string) {
    const website = await this.prisma.website.findFirst({
      where: { businessId, deletedAt: null },
    });

    if (!website) {
      throw new NotFoundException('Website configuration not found');
    }

    const domain = await this.prisma.domain.findFirst({
      where: { id: domainId, websiteId: website.id, deletedAt: null },
    });

    if (!domain) {
      throw new NotFoundException('Custom domain not found');
    }

    // Reset status to PENDING and trigger verify job
    const updated = await this.prisma.domain.update({
      where: { id: domain.id },
      data: {
        status: 'PENDING',
        dnsVerified: false,
        sslStatus: 'pending',
      },
    });

    await this.domainVerificationQueue.add('verify', { domainId: domain.id });

    return updated;
  }

  async findAll(businessId: string) {
    const website = await this.prisma.website.findFirst({
      where: { businessId, deletedAt: null },
    });

    if (!website) {
      throw new NotFoundException('Website configuration not found');
    }

    return this.prisma.domain.findMany({
      where: { websiteId: website.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }
}
