/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { PrismaService } from '../prisma/prisma.service';
import { TargetAudience, CampaignChannel } from './dto/create-campaign.dto';
import { CampaignStatus } from '../../generated/prisma';

describe('MarketingService', () => {
  let service: MarketingService;

  const mockPrismaService = {
    campaign: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    customer: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: getQueueToken('campaigns'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<MarketingService>(MarketingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a campaign if it does not already exist', async () => {
      mockPrismaService.campaign.findFirst.mockResolvedValue(null);
      mockPrismaService.campaign.create.mockResolvedValue({
        id: 'campaign-1',
        name: 'Promo',
      });

      const dto = {
        name: 'Promo',
        channel: CampaignChannel.WHATSAPP,
        messageTemplate: 'PROMO_CAMPAIGN',
        targetAudience: TargetAudience.ALL,
      };

      const result = await service.create('biz-1', dto);

      expect(result).toBeDefined();
      expect(result.id).toBe('campaign-1');
      expect(mockPrismaService.campaign.create).toHaveBeenCalledWith({
        data: {
          businessId: 'biz-1',
          name: 'Promo',
          channel: CampaignChannel.WHATSAPP,
          messageTemplate: 'PROMO_CAMPAIGN',
          scheduledAt: null,
          status: CampaignStatus.DRAFT,
          sentCount: 0,
          deliveredCount: 0,
          clickCount: 0,
          revenueAttributed: 0,
        },
      });
    });

    it('should throw ConflictException if campaign name already exists', async () => {
      mockPrismaService.campaign.findFirst.mockResolvedValue({
        id: 'campaign-1',
      });

      const dto = {
        name: 'Promo',
        channel: CampaignChannel.WHATSAPP,
        messageTemplate: 'PROMO_CAMPAIGN',
        targetAudience: TargetAudience.ALL,
      };

      await expect(service.create('biz-1', dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated campaigns and count', async () => {
      mockPrismaService.$transaction.mockResolvedValue([
        [{ id: 'campaign-1' }],
        1,
      ]);

      const result = await service.findAll('biz-1', 1, 10);

      expect(result.items).toEqual([{ id: 'campaign-1' }]);
      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return campaign details if found', async () => {
      mockPrismaService.campaign.findFirst.mockResolvedValue({
        id: 'campaign-1',
      });

      const result = await service.findOne('biz-1', 'campaign-1');

      expect(result).toEqual({ id: 'campaign-1' });
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrismaService.campaign.findFirst.mockResolvedValue(null);

      await expect(service.findOne('biz-1', 'campaign-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('triggerSend', () => {
    it('should queue the job immediately for immediate send', async () => {
      const campaign = {
        id: 'campaign-1',
        businessId: 'biz-1',
        name: 'Promo',
        channel: CampaignChannel.WHATSAPP,
        messageTemplate: 'PROMO_CAMPAIGN',
        status: CampaignStatus.DRAFT,
      };
      mockPrismaService.campaign.findFirst.mockResolvedValue(campaign);
      mockPrismaService.customer.findMany.mockResolvedValue([
        { id: 'cust-1' },
        { id: 'cust-2' },
      ]);
      mockPrismaService.campaign.update.mockResolvedValue({
        ...campaign,
        status: CampaignStatus.SENDING,
      });

      const dto = {
        targetAudience: TargetAudience.ALL,
      };

      const result = await service.triggerSend('biz-1', 'campaign-1', dto);

      expect(result.status).toBe(CampaignStatus.SENDING);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'dispatch-campaign',
        {
          campaignId: 'campaign-1',
          businessId: 'biz-1',
          customerIds: ['cust-1', 'cust-2'],
          variables: {},
        },
        { delay: 0 },
      );
    });

    it('should queue the job with delay if scheduledAt is in the future', async () => {
      const futureDate = new Date(Date.now() + 100000);
      const campaign = {
        id: 'campaign-1',
        businessId: 'biz-1',
        name: 'Promo',
        channel: CampaignChannel.WHATSAPP,
        messageTemplate: 'PROMO_CAMPAIGN',
        status: CampaignStatus.DRAFT,
        scheduledAt: futureDate,
      };
      mockPrismaService.campaign.findFirst.mockResolvedValue(campaign);
      mockPrismaService.customer.findMany.mockResolvedValue([{ id: 'cust-1' }]);
      mockPrismaService.campaign.update.mockResolvedValue({
        ...campaign,
        status: CampaignStatus.SCHEDULED,
      });

      const dto = {
        targetAudience: TargetAudience.ALL,
      };

      const result = await service.triggerSend('biz-1', 'campaign-1', dto);

      expect(result.status).toBe(CampaignStatus.SCHEDULED);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'dispatch-campaign',
        {
          campaignId: 'campaign-1',
          businessId: 'biz-1',
          customerIds: ['cust-1'],
          variables: {},
        },
        expect.objectContaining({ delay: expect.any(Number) }),
      );
    });

    it('should throw ConflictException if target audience is empty', async () => {
      const campaign = {
        id: 'campaign-1',
        businessId: 'biz-1',
        status: CampaignStatus.DRAFT,
      };
      mockPrismaService.campaign.findFirst.mockResolvedValue(campaign);
      mockPrismaService.customer.findMany.mockResolvedValue([]);

      const dto = {
        targetAudience: TargetAudience.ALL,
      };

      await expect(
        service.triggerSend('biz-1', 'campaign-1', dto),
      ).rejects.toThrow(ConflictException);
    });
  });
});
