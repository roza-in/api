/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';
import { TargetAudience, CampaignChannel } from './dto/create-campaign.dto';
import { PermissionsService } from '../permissions/permissions.service';
import { EntitlementsService } from '../permissions/entitlements.service';

describe('MarketingController', () => {
  let controller: MarketingController;
  let service: MarketingService;

  const mockMarketingService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    triggerSend: jest.fn(),
  };

  const mockPermissionsService = {
    hasPermission: jest.fn().mockResolvedValue(true),
    getRoleName: jest.fn().mockResolvedValue('OWNER'),
  };

  const mockEntitlementsService = {
    hasEntitlement: jest.fn().mockResolvedValue(true),
  };

  const mockUser = {
    userId: 'user-uuid',
    email: 'test@example.com',
    businessId: 'business-uuid',
    memberId: 'member-uuid',
    roleId: 'role-uuid',
    role: 'OWNER',
    iat: 0,
    exp: 0,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketingController],
      providers: [
        { provide: MarketingService, useValue: mockMarketingService },
        { provide: PermissionsService, useValue: mockPermissionsService },
        { provide: EntitlementsService, useValue: mockEntitlementsService },
      ],
    }).compile();

    controller = module.get<MarketingController>(MarketingController);
    service = module.get<MarketingService>(MarketingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should delegate to service.create', async () => {
      const dto = {
        name: 'Promo',
        channel: CampaignChannel.WHATSAPP,
        messageTemplate: 'PROMO_CAMPAIGN',
        targetAudience: TargetAudience.ALL,
      };
      mockMarketingService.create.mockResolvedValue({
        id: 'campaign-1',
        ...dto,
      });

      const result = await controller.create(mockUser, dto);

      expect(result).toBeDefined();
      expect(service.create).toHaveBeenCalledWith('business-uuid', dto);
    });
  });

  describe('findAll', () => {
    it('should delegate to service.findAll', async () => {
      mockMarketingService.findAll.mockResolvedValue({ items: [], total: 0 });

      const result = await controller.findAll(mockUser, 1, 10);

      expect(result).toEqual({ items: [], total: 0 });
      expect(service.findAll).toHaveBeenCalledWith('business-uuid', 1, 10);
    });
  });

  describe('findOne', () => {
    it('should delegate to service.findOne', async () => {
      mockMarketingService.findOne.mockResolvedValue({ id: 'campaign-1' });

      const result = await controller.findOne(mockUser, 'campaign-1');

      expect(result).toEqual({ id: 'campaign-1' });
      expect(service.findOne).toHaveBeenCalledWith(
        'business-uuid',
        'campaign-1',
      );
    });
  });

  describe('update', () => {
    it('should delegate to service.update', async () => {
      const dto = { name: 'New Promo Name' };
      mockMarketingService.update.mockResolvedValue({
        id: 'campaign-1',
        name: 'New Promo Name',
      });

      const result = await controller.update(mockUser, 'campaign-1', dto);

      expect(result).toEqual({ id: 'campaign-1', name: 'New Promo Name' });
      expect(service.update).toHaveBeenCalledWith(
        'business-uuid',
        'campaign-1',
        dto,
      );
    });
  });

  describe('remove', () => {
    it('should delegate to service.delete', async () => {
      mockMarketingService.delete.mockResolvedValue({
        id: 'campaign-1',
        deletedAt: new Date(),
      });

      const result = await controller.remove(mockUser, 'campaign-1');

      expect(result).toBeDefined();
      expect(service.delete).toHaveBeenCalledWith(
        'business-uuid',
        'campaign-1',
      );
    });
  });

  describe('triggerSend', () => {
    it('should delegate to service.triggerSend', async () => {
      const dto = {
        targetAudience: TargetAudience.ALL,
        variables: { offer: '50% off' },
      };
      mockMarketingService.triggerSend.mockResolvedValue({
        id: 'campaign-1',
        status: 'sending',
      });

      const result = await controller.triggerSend(mockUser, 'campaign-1', dto);

      expect(result).toEqual({ id: 'campaign-1', status: 'sending' });
      expect(service.triggerSend).toHaveBeenCalledWith(
        'business-uuid',
        'campaign-1',
        dto,
      );
    });
  });
});
