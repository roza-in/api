import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { ThemesService } from './themes.service';
import { CreateCustomThemeDto } from './dto/create-custom-theme.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

@ApiTags('Websites Themes')
@Controller('websites/themes')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@ApiBearerAuth()
@Permissions('website:manage')
export class ThemesController {
  constructor(private readonly themesService: ThemesService) {}

  @Get('system')
  @ApiOperation({ summary: 'List all default system templates' })
  @ApiResponse({ status: 200, description: 'System themes list returned' })
  async findAllSystem() {
    return this.themesService.findAllSystem();
  }

  @Get('custom')
  @ApiOperation({
    summary: 'List custom theme profiles created by the business',
  })
  @ApiResponse({ status: 200, description: 'Custom themes list returned' })
  async findAllCustom(@CurrentUser() user: UserPayload) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.themesService.findAllCustom(user.businessId);
  }

  @Get(':themeId')
  @ApiOperation({ summary: 'Get details of a specific system or custom theme' })
  @ApiResponse({ status: 200, description: 'Theme details returned' })
  async findOne(
    @CurrentUser() user: UserPayload,
    @Param('themeId', ParseUUIDPipe) themeId: string,
  ) {
    return this.themesService.findOne(themeId, user.businessId);
  }

  @Post('custom')
  @ApiOperation({
    summary: 'Create a custom theme configuration for the business',
  })
  @ApiResponse({
    status: 201,
    description: 'Custom theme created successfully',
  })
  async createCustom(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateCustomThemeDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.themesService.createCustom(user.businessId, dto);
  }

  @Patch('custom/:themeId')
  @ApiOperation({ summary: 'Update parameters on a custom theme' })
  @ApiResponse({ status: 200, description: 'Custom theme updated' })
  async updateCustom(
    @CurrentUser() user: UserPayload,
    @Param('themeId', ParseUUIDPipe) themeId: string,
    @Body() dto: Partial<CreateCustomThemeDto>,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.themesService.updateCustom(user.businessId, themeId, dto);
  }

  @Delete('custom/:themeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom theme' })
  @ApiResponse({ status: 204, description: 'Custom theme deleted' })
  async deleteCustom(
    @CurrentUser() user: UserPayload,
    @Param('themeId', ParseUUIDPipe) themeId: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    await this.themesService.deleteCustom(user.businessId, themeId);
  }
}
