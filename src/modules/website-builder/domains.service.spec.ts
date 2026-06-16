import { Test, TestingModule } from '@nestjs/testing';
import { DomainsService } from './domains.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { QUEUE_DOMAIN_VERIFICATION } from '../queue/queue.constants';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

describe('DomainsService', () => {
  let service: DomainsService;

  const websiteFindFirst = jest.fn();
  const domainFindFirst = jest.fn();
  const domainCreate = jest.fn();
  const domainFindUnique = jest.fn();
  const domainUpdate = jest.fn();
  const domainFindMany = jest.fn();
  const websiteUpdate = jest.fn();

  const mockPrisma = {
    website: {
      findFirst: websiteFindFirst,
      update: websiteUpdate,
    },
    domain: {
      findFirst: domainFindFirst,
      create: domainCreate,
      findUnique: domainFindUnique,
      update: domainUpdate,
      findMany: domainFindMany,
    },
    $transaction: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'NODE_ENV') return 'test';
      if (key === 'ROZX_CNAME_TARGET') return 'cname.rozx.in';
      if (key === 'ROZX_A_TARGET') return '127.0.0.1';
      return null;
    }),
  };

  beforeEach(async () => {
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: getQueueToken(QUEUE_DOMAIN_VERIFICATION),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<DomainsService>(DomainsService);
    jest.clearAllMocks();
  });

  const businessId = 'business-uuid-1';
  const websiteId = 'website-uuid-1';
  const domainId = 'domain-uuid-1';

  describe('create', () => {
    it('should throw NotFoundException if website config is not found', async () => {
      websiteFindFirst.mockResolvedValue(null);

      await expect(
        service.create(businessId, 'glowstudio.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if hostname format is invalid', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });

      await expect(
        service.create(businessId, 'invalid_domain'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if domain is already registered', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      domainFindFirst.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.create(businessId, 'glowstudio.com'),
      ).rejects.toThrow(ConflictException);
    });

    it('should create domain and enqueue verification job', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      domainFindFirst.mockResolvedValue(null);
      domainCreate.mockResolvedValue({
        id: domainId,
        hostname: 'glowstudio.com',
      });

      const result = await service.create(businessId, 'glowstudio.com');

      expect(domainCreate).toHaveBeenCalledWith({
        data: {
          websiteId,
          hostname: 'glowstudio.com',
          status: 'PENDING',
          sslStatus: 'pending',
          dnsVerified: false,
        },
      });

      expect(mockQueue.add).toHaveBeenCalledWith('verify', { domainId });
      expect(result.hostname).toBe('glowstudio.com');
    });
  });

  describe('verifyDns', () => {
    it('should mock resolve successfully in test environment', async () => {
      domainFindUnique.mockResolvedValue({
        id: domainId,
        hostname: 'glowstudio.com',
        websiteId,
        status: 'PENDING',
      });

      // spy on provisionSsl to ensure it triggers next step
      const provisionSpy = jest
        .spyOn(service, 'provisionSsl')
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        .mockResolvedValue({} as any);

      await service.verifyDns(domainId);

      expect(domainUpdate).toHaveBeenCalledWith({
        where: { id: domainId },
        data: {
          status: 'VERIFIED',
          dnsVerified: true,
        },
      });

      expect(provisionSpy).toHaveBeenCalledWith(domainId);
    });
  });

  describe('provisionSsl', () => {
    it('should successfully transition status to ACTIVE and link domain to website', async () => {
      domainFindUnique.mockResolvedValue({
        id: domainId,
        websiteId,
        hostname: 'glowstudio.com',
        status: 'VERIFIED',
      });
      domainUpdate.mockResolvedValue({
        id: domainId,
        status: 'ACTIVE',
        sslStatus: 'issued',
      });

      const result = await service.provisionSsl(domainId);

      expect(domainUpdate).toHaveBeenCalledWith({
        where: { id: domainId },
        data: {
          status: 'SSL_PROVISIONING',
          sslStatus: 'provisioning',
        },
      });

      expect(websiteUpdate).toHaveBeenCalledWith({
        where: { id: websiteId },
        data: {
          customDomain: 'glowstudio.com',
          domainStatus: 'ACTIVE',
        },
      });

      expect(result!.status).toBe('ACTIVE');
    });
  });

  describe('remove', () => {
    it('should soft-delete domain and clear customDomain if active on website', async () => {
      websiteFindFirst.mockResolvedValue({
        id: websiteId,
        customDomain: 'glowstudio.com',
      });
      domainFindFirst.mockResolvedValue({
        id: domainId,
        hostname: 'glowstudio.com',
        websiteId,
      });

      await service.remove(businessId, domainId);

      expect(domainUpdate).toHaveBeenCalledWith({
        where: { id: domainId },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: { deletedAt: expect.any(Date) },
      });

      expect(websiteUpdate).toHaveBeenCalledWith({
        where: { id: websiteId },
        data: {
          customDomain: null,
          domainStatus: 'PENDING',
        },
      });
    });
  });

  describe('reverify', () => {
    it('should reset statuses and re-queue validation job', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      domainFindFirst.mockResolvedValue({
        id: domainId,
        hostname: 'glowstudio.com',
      });
      domainUpdate.mockResolvedValue({ id: domainId });

      await service.reverify(businessId, domainId);

      expect(domainUpdate).toHaveBeenCalledWith({
        where: { id: domainId },
        data: {
          status: 'PENDING',
          dnsVerified: false,
          sslStatus: 'pending',
        },
      });

      expect(mockQueue.add).toHaveBeenCalledWith('verify', { domainId });
    });
  });

  describe('findAll', () => {
    it('should return all active custom domains', async () => {
      websiteFindFirst.mockResolvedValue({ id: websiteId });
      const domainsList = [{ id: domainId, hostname: 'glowstudio.com' }];
      domainFindMany.mockResolvedValue(domainsList);

      const result = await service.findAll(businessId);
      expect(result).toEqual(domainsList);
      expect(domainFindMany).toHaveBeenCalledWith({
        where: { websiteId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
