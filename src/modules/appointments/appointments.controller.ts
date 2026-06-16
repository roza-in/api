import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Query,
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
import { AppointmentsService } from './appointments.service';
import { AvailabilityService } from './availability.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentSearchDto } from './dto/appointment-search.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { UserPayload } from '../../common/interfaces/user-payload.interface';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Appointments')
@Controller('appointments')
@ApiBearerAuth()
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly availabilityService: AvailabilityService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Permissions('appointment:create')
  @ApiOperation({ summary: 'Create a new appointment' })
  @ApiResponse({ status: 201, description: 'Appointment created successfully' })
  async create(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateAppointmentDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.appointmentsService.createAppointment(
      user.businessId,
      user.userId,
      dto,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Permissions('appointment:read')
  @ApiOperation({ summary: 'Find all appointments with filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of appointments' })
  async findAll(
    @CurrentUser() user: UserPayload,
    @Query() query: AppointmentSearchDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.appointmentsService.findAll(user.businessId, query);
  }

  @Get('availability')
  @ApiOperation({
    summary: 'Get available slots for a branch, service and date',
  })
  @ApiResponse({ status: 200, description: 'List of available time slots' })
  async getAvailability(@Query() query: AvailabilityQueryDto) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: query.branchId, deletedAt: null },
    });
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }
    return this.availabilityService.getAvailableSlots(branch.businessId, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Permissions('appointment:read')
  @ApiOperation({ summary: 'Get appointment details by ID' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 200, description: 'Appointment details' })
  async findOne(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.appointmentsService.findOne(user.businessId, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Permissions('appointment:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update or reschedule an appointment' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 200, description: 'Appointment updated successfully' })
  async update(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.appointmentsService.updateAppointment(
      user.businessId,
      user.userId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @Permissions('appointment:delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete an appointment' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 200, description: 'Appointment deleted successfully' })
  async remove(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.businessId) {
      throw new BadRequestException('No business context');
    }
    return this.appointmentsService.softDelete(
      user.businessId,
      user.userId,
      id,
    );
  }
}
