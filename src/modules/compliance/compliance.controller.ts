import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { UpdateConsentDto } from './dto/update-consent.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

@ApiTags('Compliance')
@Controller('businesses/compliance')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@ApiBearerAuth()
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('customers/:customerId/consents')
  @Permissions('customer:read')
  @ApiOperation({ summary: "Get a customer's active consents" })
  @ApiParam({ name: 'customerId', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'List of consents' })
  async getConsents(
    @CurrentUser() user: UserPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.complianceService.getConsents(user.businessId, customerId);
  }

  @Post('customers/:customerId/consents')
  @Permissions('customer:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Create or update a customer's consent settings" })
  @ApiParam({ name: 'customerId', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Consent record updated' })
  async updateConsent(
    @CurrentUser() user: UserPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: UpdateConsentDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.complianceService.updateConsent(
      user.businessId,
      customerId,
      dto.consentType,
      dto.granted,
      dto.source,
    );
  }

  @Get('customers/:customerId/export')
  @Permissions('customer:read')
  @ApiOperation({ summary: 'Export complete customer data as JSON' })
  @ApiParam({ name: 'customerId', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Secure S3 signed URL' })
  async exportCustomerData(
    @CurrentUser() user: UserPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.complianceService.exportCustomerData(
      user.businessId,
      customerId,
      user.userId,
    );
  }

  @Post('customers/:customerId/deletion')
  @Permissions('customer:delete')
  @ApiOperation({
    summary: 'Request customer data deletion (Right to Forgotten)',
  })
  @ApiParam({ name: 'customerId', description: 'Customer UUID' })
  @ApiResponse({ status: 201, description: 'Deletion request registered' })
  async requestDeletion(
    @CurrentUser() user: UserPayload,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.complianceService.requestDeletion(user.businessId, customerId);
  }

  @Delete('deletion-requests/:requestId')
  @Permissions('customer:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending deletion request' })
  @ApiParam({ name: 'requestId', description: 'Deletion Request UUID' })
  @ApiResponse({ status: 200, description: 'Deletion request cancelled' })
  async cancelDeletionRequest(
    @CurrentUser() user: UserPayload,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.complianceService.cancelDeletionRequest(
      user.businessId,
      requestId,
    );
  }

  @Post('deletion-requests/:requestId/execute')
  @Permissions('customer:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Immediately execute a pending deletion request' })
  @ApiParam({ name: 'requestId', description: 'Deletion Request UUID' })
  @ApiResponse({ status: 200, description: 'Customer anonymized immediately' })
  async executeDeletionRequest(
    @CurrentUser() user: UserPayload,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.complianceService.executeDeletionRequest(
      user.businessId,
      requestId,
      user.userId,
    );
  }
}
