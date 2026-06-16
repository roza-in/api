import { Test, TestingModule } from '@nestjs/testing';
import { ThemesService } from './themes.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('ThemesService', () => {
  let service: ThemesService;

  const themeFindMany = jest.fn();
  const themeFindUnique = jest.fn();
  const themeCreate = jest.fn();
  const themeUpdate = jest.fn();
  const websiteFindMany = jest.fn();

  const mockPrisma = {
    theme: {
      findMany: themeFindMany,
      findUnique: themeFindUnique,
      create: themeCreate,
      update: themeUpdate,
    },
    website: {
      findMany: websiteFindMany,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThemesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ThemesService>(ThemesService);
    jest.clearAllMocks();
  });

  const businessId = 'business-uuid-1';
  const customThemeId = 'custom-theme-uuid';
  const systemThemeId = 'system-theme-uuid';

  describe('findAllSystem', () => {
    it('should find system themes only', async () => {
      themeFindMany.mockResolvedValue([{ id: systemThemeId, isSystem: true }]);
      const result = await service.findAllSystem();
      expect(result).toHaveLength(1);
      expect(themeFindMany).toHaveBeenCalledWith({
        where: { isSystem: true, businessId: null },
      });
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if theme is not found', async () => {
      themeFindUnique.mockResolvedValue(null);
      await expect(service.findOne(systemThemeId, businessId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if theme belongs to another business', async () => {
      themeFindUnique.mockResolvedValue({
        id: customThemeId,
        isSystem: false,
        businessId: 'other-biz-uuid',
      });
      await expect(service.findOne(customThemeId, businessId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow fetching system theme', async () => {
      const mockTheme = { id: systemThemeId, isSystem: true, businessId: null };
      themeFindUnique.mockResolvedValue(mockTheme);
      const result = await service.findOne(systemThemeId, businessId);
      expect(result).toEqual(mockTheme);
    });

    it('should allow fetching custom theme for owner business', async () => {
      const mockTheme = { id: customThemeId, isSystem: false, businessId };
      themeFindUnique.mockResolvedValue(mockTheme);
      const result = await service.findOne(customThemeId, businessId);
      expect(result).toEqual(mockTheme);
    });
  });

  describe('createCustom', () => {
    it('should create custom theme record', async () => {
      const dto = {
        name: 'My Theme',
        colorsJson: { primary: '#fff' },
        typographyJson: {},
        spacingJson: {},
        buttonStylesJson: {},
        layoutRulesJson: {},
      };
      themeCreate.mockResolvedValue({ id: 'new-theme-id', ...dto });

      const result = await service.createCustom(businessId, dto);
      expect(result.id).toBeDefined();
      expect(themeCreate).toHaveBeenCalled();
    });
  });

  describe('updateCustom', () => {
    it('should throw ForbiddenException if theme is a system theme', async () => {
      themeFindUnique.mockResolvedValue({ id: systemThemeId, isSystem: true });
      await expect(
        service.updateCustom(businessId, systemThemeId, { name: 'New Name' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update custom theme successfully', async () => {
      themeFindUnique.mockResolvedValue({
        id: customThemeId,
        isSystem: false,
        businessId,
      });
      themeUpdate.mockResolvedValue({ id: customThemeId, name: 'New Name' });

      const result = await service.updateCustom(businessId, customThemeId, {
        name: 'New Name',
      });
      expect(result.name).toEqual('New Name');
    });
  });

  describe('deleteCustom', () => {
    it('should throw ForbiddenException if custom theme is currently in use', async () => {
      themeFindUnique.mockResolvedValue({
        id: customThemeId,
        isSystem: false,
        businessId,
      });
      websiteFindMany.mockResolvedValue([{ id: 'website-id' }]); // In use

      await expect(
        service.deleteCustom(businessId, customThemeId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should soft delete theme if not in use', async () => {
      themeFindUnique.mockResolvedValue({
        id: customThemeId,
        isSystem: false,
        businessId,
      });
      websiteFindMany.mockResolvedValue([]); // Not in use
      themeUpdate.mockResolvedValue({
        id: customThemeId,
        deletedAt: new Date(),
      });

      const result = await service.deleteCustom(businessId, customThemeId);
      expect(result.deletedAt).toBeDefined();
    });
  });
});
