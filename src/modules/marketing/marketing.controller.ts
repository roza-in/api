import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { MarketingService } from './marketing.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { SendCampaignDto } from './dto/send-campaign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

@ApiTags('Marketing Campaigns')
@Controller('businesses/campaigns')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@ApiBearerAuth()
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Post()
  @Permissions('campaign:create')
  @ApiOperation({ summary: 'Create a new draft campaign' })
  @ApiResponse({ status: 201, description: 'Campaign created' })
  async create(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateCampaignDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.marketingService.create(user.businessId, dto);
  }

  @Get()
  @Permissions('campaign:read')
  @ApiOperation({ summary: 'List all campaigns (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of campaigns returned' })
  async findAll(
    @CurrentUser() user: UserPayload,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.marketingService.findAll(
      user.businessId,
      Number(page),
      Number(limit),
    );
  }

  @Get(':id')
  @Permissions('campaign:read')
  @ApiOperation({ summary: 'Get campaign details by ID' })
  @ApiParam({ name: 'id', description: 'Campaign UUID' })
  @ApiResponse({ status: 200, description: 'Campaign details' })
  async findOne(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.marketingService.findOne(user.businessId, id);
  }

  @Patch(':id')
  @Permissions('campaign:create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a draft campaign' })
  @ApiParam({ name: 'id', description: 'Campaign UUID' })
  @ApiResponse({ status: 200, description: 'Campaign updated' })
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.marketingService.update(user.businessId, id, dto);
  }

  @Delete(':id')
  @Permissions('campaign:create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a campaign' })
  @ApiParam({ name: 'id', description: 'Campaign UUID' })
  @ApiResponse({ status: 200, description: 'Campaign deleted' })
  async remove(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.marketingService.delete(user.businessId, id);
  }

  @Post(':id/send')
  @Permissions('campaign:send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger sending / scheduling of a campaign' })
  @ApiParam({ name: 'id', description: 'Campaign UUID' })
  @ApiResponse({
    status: 200,
    description: 'Campaign scheduled or sent successfully',
  })
  async triggerSend(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendCampaignDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.marketingService.triggerSend(user.businessId, id, dto);
  }
}
