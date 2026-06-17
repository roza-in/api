/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-namespace */
import { Test, TestingModule } from '@nestjs/testing';
import { CampaignProcessor } from './campaign.processor';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Job } from 'bullmq';
import { CampaignStatus, CampaignChannel } from '../../generated/prisma';

describe('CampaignProcessor', () => {
  let processor: CampaignProcessor;
  let prisma: PrismaService;
  let notificationsService: NotificationsService;

  const mockPrismaService = {
    campaign: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    customer: {
      findMany: jest.fn(),
    },
  };

  const mockNotificationsService = {
    send: jest.fn(),
  };

  const mockJob = {
    name: 'dispatch-campaign',
    data: {
      campaignId: 'campaign-1',
      businessId: 'biz-1',
      customerIds: ['cust-1', 'cust-2'],
      variables: { offer: '20% off' },
    },
  } as unknown as Job;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignProcessor,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    processor = module.get<CampaignProcessor>(CampaignProcessor);
    prisma = module.get<PrismaService>(PrismaService);
    notificationsService =
      module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should process campaign dispatch, sending notifications to all resolved customers', async () => {
    const campaign = {
      id: 'campaign-1',
      businessId: 'biz-1',
      channel: CampaignChannel.WHATSAPP,
      messageTemplate: 'PROMO_CAMPAIGN',
      status: CampaignStatus.DRAFT,
      business: {
        name: 'Glow Studio',
      },
    };

    mockPrismaService.campaign.findFirst.mockResolvedValue(campaign);
    mockPrismaService.customer.findMany.mockResolvedValue([
      { id: 'cust-1', name: 'Rahul' },
      { id: 'cust-2', name: 'Rohan' },
    ]);
    mockPrismaService.campaign.update.mockResolvedValue({});
    mockNotificationsService.send.mockResolvedValue({});

    await processor.process(mockJob);

    expect(prisma.campaign.findFirst).toHaveBeenCalledWith({
      where: { id: 'campaign-1', businessId: 'biz-1', deletedAt: null },
      include: { business: true },
    });
    expect(prisma.campaign.update).toHaveBeenFirstCalledWith({
      where: { id: 'campaign-1' },
      data: { status: CampaignStatus.SENDING },
    });
    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['cust-1', 'cust-2'] },
        businessId: 'biz-1',
        deletedAt: null,
      },
      select: { id: true, name: true },
    });
    expect(notificationsService.send).toHaveBeenCalledTimes(2);
    expect(notificationsService.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-1',
        templateId: 'PROMO_CAMPAIGN',
        variables: { offer: '20% off', customerName: 'Rahul', businessName: 'Glow Studio' },
        preferredChannel: CampaignChannel.WHATSAPP,
        campaignId: 'campaign-1',
      }),
    );
    expect(notificationsService.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-2',
        templateId: 'PROMO_CAMPAIGN',
        variables: { offer: '20% off', customerName: 'Rohan', businessName: 'Glow Studio' },
        preferredChannel: CampaignChannel.WHATSAPP,
        campaignId: 'campaign-1',
      }),
    );
    expect(prisma.campaign.update).toHaveBeenLastCalledWith({
      where: { id: 'campaign-1' },
      data: { status: CampaignStatus.COMPLETED, sentCount: 2 },
    });
  });

  it('should continue processing other customers if sending to one customer throws an error', async () => {
    const campaign = {
      id: 'campaign-1',
      businessId: 'biz-1',
      channel: CampaignChannel.WHATSAPP,
      messageTemplate: 'PROMO_CAMPAIGN',
      status: CampaignStatus.DRAFT,
      business: {
        name: 'Glow Studio',
      },
    };

    mockPrismaService.campaign.findFirst.mockResolvedValue(campaign);
    mockPrismaService.customer.findMany.mockResolvedValue([
      { id: 'cust-1', name: 'Rahul' },
      { id: 'cust-2', name: 'Rohan' },
    ]);
    mockNotificationsService.send
      .mockRejectedValueOnce(new Error('Consent denied'))
      .mockResolvedValueOnce({});

    await processor.process(mockJob);

    expect(notificationsService.send).toHaveBeenCalledTimes(2);
    expect(prisma.campaign.update).toHaveBeenLastCalledWith({
      where: { id: 'campaign-1' },
      data: { status: CampaignStatus.COMPLETED, sentCount: 1 }, // Only 1 sent successfully
    });
  });
});

// Custom matcher to get around jest's call index verification
// or simply use helper check
const customMatchers = {
  toHaveBeenFirstCalledWith(mockFn: any, expected: any) {
    const calls = mockFn.mock.calls;
    if (calls.length === 0) {
      return {
        pass: false,
        message: () => 'Expected mock function to have been called',
      };
    }
    const firstCall = calls[0][0];
    const pass = JSON.stringify(firstCall) === JSON.stringify(expected);
    return {
      pass,
      message: () =>
        `Expected first call to match. Got: ${JSON.stringify(firstCall)}`,
    };
  },
};

expect.extend(customMatchers);

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveBeenFirstCalledWith(expected: any): R;
    }
  }
}
