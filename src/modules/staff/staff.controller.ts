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
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';

@ApiTags('Staff')
@Controller('businesses/staff')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@ApiBearerAuth()
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  @Permissions('staff:create')
  @ApiOperation({ summary: 'Register a new staff member' })
  @ApiResponse({ status: 201, description: 'Staff member created' })
  async createStaff(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateStaffDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.staffService.createStaff(user.businessId, user.userId, dto);
  }

  @Get()
  @Permissions('staff:read')
  @ApiOperation({ summary: 'List all active staff members' })
  @ApiResponse({ status: 200, description: 'List of staff members' })
  async findAll(@CurrentUser() user: UserPayload) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.staffService.findAll(user.businessId);
  }

  @Get(':id')
  @Permissions('staff:read')
  @ApiOperation({ summary: 'Get staff member profile' })
  @ApiParam({ name: 'id', description: 'Staff UUID' })
  @ApiResponse({ status: 200, description: 'Staff member profile' })
  async findOne(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.staffService.findOne(user.businessId, id);
  }

  @Patch(':id')
  @Permissions('staff:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update staff member profile' })
  @ApiParam({ name: 'id', description: 'Staff UUID' })
  @ApiResponse({ status: 200, description: 'Staff member updated' })
  async updateStaff(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.staffService.updateStaff(user.businessId, user.userId, id, dto);
  }

  @Delete(':id')
  @Permissions('staff:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a staff member profile' })
  @ApiParam({ name: 'id', description: 'Staff UUID' })
  @ApiResponse({ status: 200, description: 'Staff member deleted' })
  async removeStaff(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.staffService.softDeleteStaff(user.businessId, user.userId, id);
  }

  @Post(':id/invite')
  @Permissions('staff:create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Invite staff member (trigger login credentials creation)',
  })
  @ApiParam({ name: 'id', description: 'Staff UUID' })
  @ApiResponse({ status: 200, description: 'Invitation sent' })
  async inviteStaff(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.staffService.inviteStaff(user.businessId, user.userId, id);
  }

  @Post(':id/leaves')
  @Permissions('staff:update')
  @ApiOperation({ summary: 'Add a new leave for a staff member' })
  @ApiParam({ name: 'id', description: 'Staff UUID' })
  @ApiResponse({ status: 201, description: 'Leave entry created' })
  async createLeave(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) staffId: string,
    @Body() dto: CreateLeaveDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.staffService.createLeave(
      user.businessId,
      user.userId,
      staffId,
      dto,
    );
  }

  @Delete('leaves/:leaveId')
  @Permissions('staff:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete/Cancel a leave entry' })
  @ApiParam({ name: 'leaveId', description: 'Leave UUID' })
  @ApiResponse({ status: 200, description: 'Leave deleted' })
  async removeLeave(
    @CurrentUser() user: UserPayload,
    @Param('leaveId', ParseUUIDPipe) leaveId: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.staffService.softDeleteLeave(
      user.businessId,
      user.userId,
      leaveId,
    );
  }
}
