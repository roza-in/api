import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto, TargetAudience } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { SendCampaignDto } from './dto/send-campaign.dto';
import { Campaign, CampaignStatus } from '../../generated/prisma';

@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('campaigns')
    private readonly campaignQueue: Queue,
  ) {}

  async create(businessId: string, dto: CreateCampaignDto): Promise<Campaign> {
    const { name, channel, messageTemplate, scheduledAt } = dto;

    const existing = await this.prisma.campaign.findFirst({
      where: { businessId, name, deletedAt: null },
    });

    if (existing) {
      throw new ConflictException('Campaign with this name already exists');
    }

    return this.prisma.campaign.create({
      data: {
        businessId,
        name,
        channel,
        messageTemplate,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: CampaignStatus.DRAFT,
        sentCount: 0,
        deliveredCount: 0,
        clickCount: 0,
        revenueAttributed: 0,
      },
    });
  }

  async findAll(
    businessId: string,
    page = 1,
    limit = 10,
  ): Promise<{ items: Campaign[]; total: number }> {
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where: { businessId, deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.campaign.count({
        where: { businessId, deletedAt: null },
      }),
    ]);

    return { items, total };
  }

  async findOne(businessId: string, id: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, businessId, deletedAt: null },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return campaign;
  }

  async update(
    businessId: string,
    id: string,
    dto: UpdateCampaignDto,
  ): Promise<Campaign> {
    const campaign = await this.findOne(businessId, id);

    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new ConflictException('Only draft campaigns can be updated');
    }

    const { name, channel, messageTemplate, scheduledAt } = dto;

    return this.prisma.campaign.update({
      where: { id },
      data: {
        name,
        channel,
        messageTemplate,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      },
    });
  }

  async delete(businessId: string, id: string): Promise<Campaign> {
    await this.findOne(businessId, id);

    return this.prisma.campaign.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async triggerSend(
    businessId: string,
    id: string,
    dto: SendCampaignDto,
  ): Promise<Campaign> {
    const campaign = await this.findOne(businessId, id);

    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new ConflictException('Campaign is already scheduled or sent');
    }

    const { targetAudience, customerIds = [], variables = {} } = dto;

    let finalCustomerIds: string[] = [];
    if (targetAudience === TargetAudience.SELECTED) {
      finalCustomerIds = customerIds;
    } else {
      const customers = await this.prisma.customer.findMany({
        where: { businessId, deletedAt: null },
        select: { id: true },
      });
      finalCustomerIds = customers.map((c) => c.id);
    }

    if (finalCustomerIds.length === 0) {
      throw new ConflictException('Target audience cannot be empty');
    }

    const isScheduled =
      campaign.scheduledAt &&
      new Date(campaign.scheduledAt).getTime() > Date.now();
    const status = isScheduled
      ? CampaignStatus.SCHEDULED
      : CampaignStatus.SENDING;

    const updatedCampaign = await this.prisma.campaign.update({
      where: { id },
      data: { status },
    });

    const delay = isScheduled
      ? new Date(campaign.scheduledAt!).getTime() - Date.now()
      : 0;

    await this.campaignQueue.add(
      'dispatch-campaign',
      {
        campaignId: id,
        businessId,
        customerIds: finalCustomerIds,
        variables,
      },
      { delay: Math.max(0, delay) },
    );

    this.logger.log(
      `Campaign ${id} (${campaign.name}) queued with status ${status}. Delay: ${delay}ms. Recipients: ${finalCustomerIds.length}`,
    );

    return updatedCampaign;
  }
}
