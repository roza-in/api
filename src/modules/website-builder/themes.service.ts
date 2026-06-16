import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomThemeDto } from './dto/create-custom-theme.dto';
import { Prisma } from '../../generated/prisma';

@Injectable()
export class ThemesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllSystem() {
    return this.prisma.theme.findMany({
      where: {
        isSystem: true,
        businessId: null,
      },
    });
  }

  async findAllCustom(businessId: string) {
    return this.prisma.theme.findMany({
      where: {
        businessId,
        isSystem: false,
      },
    });
  }

  async findOne(themeId: string, businessId?: string) {
    const theme = await this.prisma.theme.findUnique({
      where: { id: themeId },
    });

    if (!theme) {
      throw new NotFoundException('Theme not found');
    }

    // If it is a custom theme, ensure it belongs to the business requesting it
    if (!theme.isSystem && theme.businessId !== businessId) {
      throw new ForbiddenException('You do not have access to this theme');
    }

    return theme;
  }

  async createCustom(businessId: string, dto: CreateCustomThemeDto) {
    return this.prisma.theme.create({
      data: {
        name: dto.name,
        colorsJson: dto.colorsJson as Prisma.InputJsonValue,
        typographyJson: dto.typographyJson as Prisma.InputJsonValue,
        spacingJson: dto.spacingJson as Prisma.InputJsonValue,
        buttonStylesJson: dto.buttonStylesJson as Prisma.InputJsonValue,
        layoutRulesJson: dto.layoutRulesJson as Prisma.InputJsonValue,
        isSystem: false,
        businessId,
      },
    });
  }

  async updateCustom(
    businessId: string,
    themeId: string,
    dto: Partial<CreateCustomThemeDto>,
  ) {
    const theme = await this.findOne(themeId, businessId);

    if (theme.isSystem) {
      throw new ForbiddenException('Cannot modify system themes');
    }

    const data: Prisma.ThemeUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.colorsJson !== undefined)
      data.colorsJson = dto.colorsJson as Prisma.InputJsonValue;
    if (dto.typographyJson !== undefined)
      data.typographyJson = dto.typographyJson as Prisma.InputJsonValue;
    if (dto.spacingJson !== undefined)
      data.spacingJson = dto.spacingJson as Prisma.InputJsonValue;
    if (dto.buttonStylesJson !== undefined)
      data.buttonStylesJson = dto.buttonStylesJson as Prisma.InputJsonValue;
    if (dto.layoutRulesJson !== undefined)
      data.layoutRulesJson = dto.layoutRulesJson as Prisma.InputJsonValue;

    return this.prisma.theme.update({
      where: { id: themeId },
      data,
    });
  }

  async deleteCustom(businessId: string, themeId: string) {
    const theme = await this.findOne(themeId, businessId);

    if (theme.isSystem) {
      throw new ForbiddenException('Cannot delete system themes');
    }

    // Check if any website is using this theme
    const websitesUsingTheme = await this.prisma.website.findMany({
      where: { themeId, deletedAt: null },
    });

    if (websitesUsingTheme.length > 0) {
      throw new ForbiddenException(
        'Cannot delete a theme that is currently in use by a website',
      );
    }

    return this.prisma.theme.update({
      where: { id: themeId },
      data: { deletedAt: new Date() },
    });
  }
}
