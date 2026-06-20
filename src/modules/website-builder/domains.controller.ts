import {
  Controller,
  Post,
  Get,
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
import { DomainsService } from './domains.service';
import { CreateDomainDto } from './dto/create-domain.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

@ApiTags('Website Domains')
@Controller('websites/domains')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, SubscriptionGuard)
@RequireFeature('customDomain')
@ApiBearerAuth()
@Permissions('website:manage')
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new custom domain for the website' })
  @ApiResponse({
    status: 201,
    description: 'Domain registered and verification queued',
  })
  async create(@CurrentUser() user: UserPayload, @Body() dto: CreateDomainDto) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.domainsService.create(user.businessId, dto.hostname);
  }

  @Get()
  @ApiOperation({ summary: 'List all custom domains for the business website' })
  @ApiResponse({ status: 200, description: 'List of custom domains' })
  async findAll(@CurrentUser() user: UserPayload) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.domainsService.findAll(user.businessId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a custom domain' })
  @ApiResponse({
    status: 204,
    description: 'Custom domain removed successfully',
  })
  async remove(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    await this.domainsService.remove(user.businessId, id);
  }

  @Post(':id/reverify')
  @ApiOperation({ summary: 'Manually trigger DNS/SSL reverification check' })
  @ApiResponse({ status: 200, description: 'Reverification task queued' })
  async reverify(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.domainsService.reverify(user.businessId, id);
  }
}
