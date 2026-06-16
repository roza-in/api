import {
  Controller,
  Post,
  Get,
  Body,
  Query,
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
import { ConsentService } from './consent.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateConsentDto } from './dto/update-consent.dto';
import { NotificationLogQueryDto } from './dto/notification-log-query.dto';
import { Prisma, ConsentSource } from '../../generated/prisma';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

@ApiTags('Notifications')
@Controller('businesses/notifications')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(
    private readonly consentService: ConsentService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('consent')
  @Permissions('customer:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update customer notification consent settings' })
  @ApiResponse({ status: 200, description: 'Consent updated successfully' })
  async updateConsent(
    @CurrentUser() user: UserPayload,
    @Body() dto: UpdateConsentDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.consentService.updateConsent(
      user.businessId,
      dto.customerId,
      dto.consentType,
      dto.granted,
      dto.source || ConsentSource.MANUAL,
    );
  }

  @Get('logs')
  @Permissions('customer:read')
  @ApiOperation({ summary: 'Get paginated audit logs of sent notifications' })
  @ApiResponse({ status: 200, description: 'List of notification logs' })
  async getLogs(
    @CurrentUser() user: UserPayload,
    @Query() query: NotificationLogQueryDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }

    const { page = 1, limit = 10, customerId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      businessId: user.businessId,
    };

    if (customerId) {
      where.customerId = customerId;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
