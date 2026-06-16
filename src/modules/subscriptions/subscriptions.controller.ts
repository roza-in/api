import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CheckoutSubscriptionDto } from './dto/checkout-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';
import { Subscription } from '../../generated/prisma';

@ApiTags('Subscriptions')
@Controller('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  @Permissions('subscription:manage')
  @ApiOperation({ summary: 'Retrieve all available subscription plans' })
  @ApiResponse({ status: 200, description: 'Plans fetched successfully' })
  async getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @Get('active')
  @Permissions('subscription:manage')
  @ApiOperation({
    summary: 'Get active subscription and entitlement details for the business',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscription details fetched successfully',
  })
  async getActiveSubscription(@CurrentUser() user: UserPayload) {
    if (!user.businessId) {
      throw new BadRequestException('No business context in session');
    }
    return this.subscriptionsService.getActiveSubscription(user.businessId);
  }

  @Post('checkout')
  @Permissions('subscription:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate subscription checkout via billing provider link',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscription checkout created successfully',
  })
  async checkout(
    @CurrentUser() user: UserPayload,
    @Body() dto: CheckoutSubscriptionDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context in session');
    }
    return this.subscriptionsService.checkout(
      user.businessId,
      user.userId,
      dto,
    );
  }

  @Post('cancel')
  @Permissions('subscription:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel current subscription at period end (grace period)',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscription scheduled for cancellation',
  })
  async cancel(@CurrentUser() user: UserPayload): Promise<Subscription> {
    if (!user.businessId) {
      throw new BadRequestException('No business context in session');
    }
    return this.subscriptionsService.cancel(user.businessId, user.userId);
  }
}
