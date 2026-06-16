import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
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
import { AdminService } from './admin.service';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  UpdateSystemStatusDto,
  UpdateBusinessStatusDto,
  ExtendTrialDto,
} from './dto/incidents.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

@ApiTags('Platform Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@ApiBearerAuth()
@Permissions('admin:all')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({
    summary:
      'Get platform-wide dashboard metrics (MRR, ARR, ARPU, Churn, Growth)',
  })
  @ApiResponse({ status: 200, description: 'Dashboard metrics returned' })
  async getDashboard() {
    return this.adminService.getDashboardMetrics();
  }

  @Get('businesses')
  @ApiOperation({ summary: 'List all businesses' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of businesses returned' })
  async getBusinesses(@Query('page') page = 1, @Query('limit') limit = 10) {
    return this.adminService.findAllBusinesses(Number(page), Number(limit));
  }

  @Patch('businesses/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend or activate a business' })
  @ApiParam({ name: 'id', description: 'Business UUID' })
  @ApiResponse({ status: 200, description: 'Business status updated' })
  async updateStatus(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBusinessStatusDto,
  ) {
    return this.adminService.updateBusinessStatus(id, dto.status, user.userId);
  }

  @Patch('businesses/:id/trial')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extend trial period for a business' })
  @ApiParam({ name: 'id', description: 'Business UUID' })
  @ApiResponse({ status: 200, description: 'Business trial extended' })
  async extendTrial(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtendTrialDto,
  ) {
    return this.adminService.extendTrial(id, dto.extensionDays, user.userId);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get health status of all platform services' })
  @ApiResponse({ status: 200, description: 'Platform statuses returned' })
  async getSystemStatus() {
    return this.adminService.getSystemStatus();
  }

  @Patch('status/:component')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update status of a platform service' })
  @ApiParam({ name: 'component', description: 'Service component name' })
  @ApiResponse({ status: 200, description: 'Service status updated' })
  async updateSystemStatus(
    @CurrentUser() user: UserPayload,
    @Param('component') component: string,
    @Body() dto: UpdateSystemStatusDto,
  ) {
    return this.adminService.updateSystemStatus(component, dto, user.userId);
  }

  @Post('incidents')
  @ApiOperation({ summary: 'Create a new incident report' })
  @ApiResponse({ status: 201, description: 'Incident logged' })
  async createIncident(@Body() dto: CreateIncidentDto) {
    return this.adminService.createIncident(dto);
  }

  @Patch('incidents/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update or resolve an incident' })
  @ApiParam({ name: 'id', description: 'Incident UUID' })
  @ApiResponse({ status: 200, description: 'Incident updated' })
  async updateIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.adminService.updateIncident(id, dto);
  }

  @Get('incidents/metrics')
  @ApiOperation({
    summary: 'Get monthly incident metrics (MTTR, CSAT, target audits)',
  })
  @ApiResponse({ status: 200, description: 'Incident metrics returned' })
  async getIncidentMetrics() {
    return this.adminService.getIncidentMetrics();
  }
}
