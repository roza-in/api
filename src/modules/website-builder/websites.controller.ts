import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
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
import { WebsitesService } from './websites.service';
import { PublishingService } from './publishing.service';
import { CreateWebsiteDto } from './dto/create-website.dto';
import { UpdateWebsiteDto } from './dto/update-website.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

@ApiTags('Websites')
@Controller('websites')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, SubscriptionGuard)
@RequireFeature('bookingWebsite')
@ApiBearerAuth()
@Permissions('website:manage')
export class WebsitesController {
  constructor(
    private readonly websitesService: WebsitesService,
    private readonly publishingService: PublishingService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Create website configuration for business (seeding default pages)',
  })
  @ApiResponse({ status: 201, description: 'Website created successfully' })
  async create(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateWebsiteDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.websitesService.create(user.businessId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get business website configuration and layout details',
  })
  @ApiResponse({ status: 200, description: 'Website config returned' })
  async findOne(@CurrentUser() user: UserPayload) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.websitesService.findOneByBusiness(user.businessId);
  }

  @Patch()
  @ApiOperation({
    summary: 'Update website settings (subdomain, theme, publishing status)',
  })
  @ApiResponse({
    status: 200,
    description: 'Website settings updated successfully',
  })
  async update(
    @CurrentUser() user: UserPayload,
    @Body() dto: UpdateWebsiteDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.websitesService.update(user.businessId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete business website configuration and associated pages',
  })
  @ApiResponse({ status: 204, description: 'Website configuration deleted' })
  async remove(@CurrentUser() user: UserPayload) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    await this.websitesService.remove(user.businessId);
  }

  @Post('publish')
  @ApiOperation({
    summary: 'Publish the business website and record a snapshot version',
  })
  @ApiResponse({ status: 200, description: 'Website published successfully' })
  async publish(@CurrentUser() user: UserPayload) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.publishingService.publish(user.businessId);
  }

  @Post('rollback/:version')
  @ApiOperation({
    summary:
      'Rollback pages and theme settings to a previous published version',
  })
  @ApiResponse({ status: 200, description: 'Website rolled back successfully' })
  async rollback(
    @CurrentUser() user: UserPayload,
    @Param('version') version: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.publishingService.rollback(
      user.businessId,
      parseInt(version, 10),
    );
  }

  @Get('publish/history')
  @ApiOperation({ summary: 'Get historical publish snapshots' })
  @ApiResponse({ status: 200, description: 'List of publish versions' })
  async getPublishHistory(@CurrentUser() user: UserPayload) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.publishingService.getPublishHistory(user.businessId);
  }
}
