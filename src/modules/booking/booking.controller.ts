import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BookingService } from './booking.service';
import { PublicBookAppointmentDto } from './dto/public-book-appointment.dto';
import { AvailabilityQueryDto } from '../appointments/dto/availability-query.dto';
import type { Request } from 'express';

@ApiTags('Public Bookings')
@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get(':slug')
  @ApiOperation({
    summary:
      'Get public business profile, active theme, and layout configurations',
  })
  @ApiResponse({ status: 200, description: 'Business info details' })
  async getBusinessInfo(@Param('slug') slug: string, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    await this.bookingService.checkRateLimit(ip);
    return this.bookingService.getBusinessInfo(slug);
  }

  @Get(':slug/services')
  @ApiOperation({ summary: 'Get active services catalog' })
  @ApiResponse({ status: 200, description: 'Active services list' })
  async getServices(@Param('slug') slug: string, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    await this.bookingService.checkRateLimit(ip);
    return this.bookingService.getServices(slug);
  }

  @Get(':slug/staff')
  @ApiOperation({ summary: 'Get active staff roster' })
  @ApiResponse({ status: 200, description: 'Staff list' })
  async getStaff(@Param('slug') slug: string, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    await this.bookingService.checkRateLimit(ip);
    return this.bookingService.getStaff(slug);
  }

  @Get(':slug/availability')
  @ApiOperation({ summary: 'Get available time slots' })
  @ApiResponse({ status: 200, description: 'List of available slots' })
  async getAvailability(
    @Param('slug') slug: string,
    @Query() query: AvailabilityQueryDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    await this.bookingService.checkRateLimit(ip);
    return this.bookingService.getAvailability(slug, query);
  }

  @Post(':slug/appointments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create public booking appointment' })
  @ApiResponse({
    status: 201,
    description: 'Appointment successfully created',
  })
  async bookAppointment(
    @Param('slug') slug: string,
    @Body() dto: PublicBookAppointmentDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    // Strict rate limit on checkout creation: max 3 requests per minute per IP to prevent spamming slots
    await this.bookingService.checkRateLimit(ip, 3, 60);
    return this.bookingService.bookAppointment(slug, dto);
  }
}
