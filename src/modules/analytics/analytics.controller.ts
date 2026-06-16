import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { ExportsService } from './exports.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { ExportReportDto } from './dto/export-report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

@ApiTags('Analytics & Dashboards')
@Controller('analytics')
@ApiBearerAuth()
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly exportsService: ExportsService,
  ) {}

  @Get('owner')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Retrieve Owner dashboard analytical metrics' })
  @ApiResponse({ status: 200, description: 'Owner dashboard metrics' })
  async getOwnerDashboard(
    @CurrentUser() user: UserPayload,
    @Query() query: DashboardQueryDto,
  ): Promise<Record<string, unknown>> {
    const bypassCache = query.refresh === true;
    return this.analyticsService.getOwnerDashboard(
      user.businessId!,
      query,
      bypassCache,
    );
  }

  @Get('manager')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Retrieve Manager dashboard operational metrics' })
  @ApiResponse({ status: 200, description: 'Manager dashboard metrics' })
  async getManagerDashboard(
    @CurrentUser() user: UserPayload,
    @Query() query: DashboardQueryDto,
  ): Promise<Record<string, unknown>> {
    const bypassCache = query.refresh === true;
    return this.analyticsService.getManagerDashboard(
      user.businessId!,
      query,
      bypassCache,
    );
  }

  @Get('reception')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER, Role.RECEPTION)
  @ApiOperation({
    summary: 'Retrieve Reception dashboard real-time queue metrics',
  })
  @ApiResponse({ status: 200, description: 'Reception dashboard metrics' })
  async getReceptionDashboard(
    @CurrentUser() user: UserPayload,
    @Query() query: DashboardQueryDto,
  ): Promise<Record<string, unknown>> {
    const bypassCache = query.refresh === true;
    return this.analyticsService.getReceptionDashboard(
      user.businessId!,
      query,
      bypassCache,
    );
  }

  @Get('staff')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER, Role.RECEPTION, Role.STAFF)
  @ApiOperation({ summary: 'Retrieve personal Staff performance dashboard' })
  @ApiResponse({ status: 200, description: 'Staff dashboard metrics' })
  async getStaffDashboard(
    @CurrentUser() user: UserPayload,
    @Query() query: DashboardQueryDto,
  ): Promise<Record<string, unknown>> {
    const bypassCache = query.refresh === true;
    return this.analyticsService.getStaffDashboard(
      user.businessId!,
      user.memberId!,
      query,
      bypassCache,
    );
  }

  @Post('export')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Trigger analytical report export' })
  @ApiResponse({ status: 201, description: 'Export triggered or completed' })
  async exportReport(
    @CurrentUser() user: UserPayload,
    @Body() dto: ExportReportDto,
  ): Promise<Record<string, unknown>> {
    if (dto.async === true) {
      return this.exportsService.queueExportReport(
        user.businessId!,
        user.userId,
        dto,
      );
    }

    const fileUrl = await this.exportsService.exportReport(
      user.businessId!,
      user.userId,
      dto.reportType,
      dto.startDate,
      dto.endDate,
      dto.format,
    );

    return { fileUrl, status: 'COMPLETED' };
  }

  @Get('export/status/:jobId')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Get background report export job status' })
  @ApiResponse({ status: 200, description: 'Export job status details' })
  async getExportStatus(
    @CurrentUser() user: UserPayload,
    @Param('jobId') jobId: string,
  ): Promise<Record<string, unknown>> {
    return this.exportsService.getExportStatus(user.businessId!, jobId);
  }
}
