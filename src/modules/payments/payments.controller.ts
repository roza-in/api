import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  BadRequestException,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { SaveConfigDto } from './dto/save-config.dto';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';
import { Refund } from '../../generated/prisma';

@ApiTags('Payments')
@Controller('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('config')
  @Permissions('business:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save or update payment gateway settings' })
  @ApiResponse({ status: 200, description: 'Settings saved successfully' })
  async saveConfig(
    @CurrentUser() user: UserPayload,
    @Body() dto: SaveConfigDto,
  ): Promise<{ message: string }> {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    await this.paymentsService.saveConfig(user.businessId, dto);
    return { message: 'Payment settings configured successfully' };
  }

  @Post('initialize')
  @Permissions('payment:create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initialize payment gateway checkout link for an appointment',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment link created successfully',
  })
  async initializePayment(
    @CurrentUser() user: UserPayload,
    @Body() dto: InitializePaymentDto,
  ): Promise<{ paymentId: string; paymentLinkUrl: string }> {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.paymentsService.initializePayment(
      user.businessId,
      user.userId,
      dto,
    );
  }

  @Post(':id/refund')
  @Permissions('payment:refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process payment refund' })
  @ApiResponse({ status: 200, description: 'Refund processed successfully' })
  async refundPayment(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundPaymentDto,
  ): Promise<Refund> {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.paymentsService.refundPayment(
      user.businessId,
      user.userId,
      id,
      dto,
    );
  }
}
