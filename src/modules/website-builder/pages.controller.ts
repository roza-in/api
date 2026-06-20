import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { PagesService } from './pages.service';
import { UpdatePageDto } from './dto/update-page.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

@ApiTags('Websites Pages')
@Controller('websites/pages')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, SubscriptionGuard)
@RequireFeature('bookingWebsite')
@ApiBearerAuth()
@Permissions('website:manage')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  @ApiOperation({
    summary: 'List all pages associated with the business website',
  })
  @ApiResponse({ status: 200, description: 'List of pages returned' })
  async findAll(@CurrentUser() user: UserPayload) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.pagesService.findAll(user.businessId);
  }

  @Get(':pageId')
  @ApiOperation({ summary: 'Get a specific page by ID' })
  @ApiResponse({ status: 200, description: 'Page details returned' })
  async findOne(
    @CurrentUser() user: UserPayload,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.pagesService.findOne(user.businessId, pageId);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get a specific page by its slug' })
  @ApiResponse({ status: 200, description: 'Page details returned' })
  async findBySlug(
    @CurrentUser() user: UserPayload,
    @Param('slug') slug: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.pagesService.findBySlug(user.businessId, slug);
  }

  @Patch(':pageId')
  @ApiOperation({
    summary: 'Update page title, slug, content layout, and SEO parameters',
  })
  @ApiResponse({ status: 200, description: 'Page updated successfully' })
  async update(
    @CurrentUser() user: UserPayload,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() dto: UpdatePageDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.pagesService.update(user.businessId, pageId, dto);
  }
}
