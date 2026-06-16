import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentType, ConsentSource } from '../../generated/prisma';
import { AppointmentsService } from '../appointments/appointments.service';
import { AvailabilityService } from '../appointments/availability.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PublicBookAppointmentDto } from './dto/public-book-appointment.dto';
import { AvailabilityQueryDto } from '../appointments/dto/availability-query.dto';

@Injectable()
export class BookingService {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly appointmentsService: AppointmentsService,
    private readonly availabilityService: AvailabilityService,
    private readonly notificationsService: NotificationsService,
  ) {
    const redisUrl = this.configService.getOrThrow<string>('REDIS_URL');
    this.redis = new Redis(redisUrl);
  }

  async checkRateLimit(ip: string, limit = 20, windowSeconds = 60) {
    const key = `ratelimit:booking:${ip}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    if (count > limit) {
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async getBusinessInfo(slug: string) {
    const business = await this.prisma.business.findUnique({
      where: { slug, deletedAt: null },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const website = await this.prisma.website.findFirst({
      where: { businessId: business.id, deletedAt: null },
      include: { theme: true },
    });

    const pages = website
      ? await this.prisma.page.findMany({
          where: { websiteId: website.id, isPublished: true, deletedAt: null },
        })
      : [];

    const branches = await this.prisma.branch.findMany({
      where: { businessId: business.id, deletedAt: null },
    });

    return {
      business,
      website,
      pages,
      branches,
    };
  }

  async getServices(slug: string) {
    const business = await this.prisma.business.findUnique({
      where: { slug, deletedAt: null },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const categories = await this.prisma.serviceCategory.findMany({
      where: { businessId: business.id, isActive: true, deletedAt: null },
    });

    const services = await this.prisma.service.findMany({
      where: { businessId: business.id, isActive: true, deletedAt: null },
      include: { category: true },
    });

    return { categories, services };
  }

  async getStaff(slug: string) {
    const business = await this.prisma.business.findUnique({
      where: { slug, deletedAt: null },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return this.prisma.staff.findMany({
      where: { businessId: business.id, isActive: true, deletedAt: null },
      include: {
        services: {
          include: { service: true },
        },
      },
    });
  }

  async getAvailability(slug: string, query: AvailabilityQueryDto) {
    const business = await this.prisma.business.findUnique({
      where: { slug, deletedAt: null },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return this.availabilityService.getAvailableSlots(business.id, query);
  }

  async bookAppointment(slug: string, dto: PublicBookAppointmentDto) {
    const business = await this.prisma.business.findUnique({
      where: { slug, deletedAt: null },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // 1. Resolve staffId if "Any Staff" is selected (i.e. staffId not provided)
    let selectedStaffId = dto.staffId;
    if (!selectedStaffId) {
      const candidates = await this.prisma.staff.findMany({
        where: {
          businessId: business.id,
          branchId: dto.branchId,
          isActive: true,
          deletedAt: null,
          services: { some: { serviceId: dto.serviceId } },
        },
      });

      if (candidates.length === 0) {
        throw new BadRequestException(
          'No staff members available for this service',
        );
      }

      // Check availability slots for each candidate to find one that is free
      const requestedStart = new Date(dto.startTime);
      for (const candidate of candidates) {
        const slots = await this.availabilityService.getAvailableSlots(
          business.id,
          {
            branchId: dto.branchId,
            serviceId: dto.serviceId,
            date: dto.startTime.split('T')[0],
            staffId: candidate.id,
          },
        );

        const hasSlot = slots.some(
          (slot) =>
            new Date(slot.startTime).getTime() === requestedStart.getTime(),
        );

        if (hasSlot) {
          selectedStaffId = candidate.id;
          break;
        }
      }

      if (!selectedStaffId) {
        throw new ConflictException(
          'No staff members are available at the requested time slot',
        );
      }
    }

    // 2. Transactionally resolve customer and record consents
    const customer = await this.prisma.$transaction(async (tx) => {
      let cust = await tx.customer.findFirst({
        where: {
          businessId: business.id,
          phone: dto.customerPhone,
          deletedAt: null,
        },
      });

      if (!cust) {
        cust = await tx.customer.create({
          data: {
            businessId: business.id,
            name: dto.customerName,
            phone: dto.customerPhone,
            email: dto.customerEmail || null,
          },
        });
      } else {
        const updateData: { email?: string; name?: string } = {};
        if (!cust.email && dto.customerEmail) {
          updateData.email = dto.customerEmail;
        }
        if (cust.name !== dto.customerName) {
          updateData.name = dto.customerName;
        }
        if (Object.keys(updateData).length > 0) {
          cust = await tx.customer.update({
            where: { id: cust.id },
            data: updateData,
          });
        }
      }

      // Consents
      if (dto.consents) {
        const consentData = [];
        if (dto.consents.marketingWhatsapp !== undefined) {
          consentData.push({
            businessId: business.id,
            customerId: cust.id,
            consentType: ConsentType.MARKETING_WHATSAPP,
            granted: dto.consents.marketingWhatsapp,
            source: ConsentSource.BOOKING_FORM,
          });
        }
        if (dto.consents.marketingSms !== undefined) {
          consentData.push({
            businessId: business.id,
            customerId: cust.id,
            consentType: ConsentType.MARKETING_SMS,
            granted: dto.consents.marketingSms,
            source: ConsentSource.BOOKING_FORM,
          });
        }
        if (dto.consents.dataProcessing !== undefined) {
          consentData.push({
            businessId: business.id,
            customerId: cust.id,
            consentType: ConsentType.DATA_PROCESSING,
            granted: dto.consents.dataProcessing,
            source: ConsentSource.BOOKING_FORM,
          });
        }

        for (const consent of consentData) {
          await tx.consent.create({ data: consent });
        }
      }

      return cust;
    });

    // 3. Delegate appointment booking
    const appointment = await this.appointmentsService.createAppointment(
      business.id,
      null,
      {
        branchId: dto.branchId,
        staffId: selectedStaffId,
        customerId: customer.id,
        serviceId: dto.serviceId,
        startTime: dto.startTime,
        notes: dto.notes,
      },
    );

    // 4. Trigger Async Notification Confirmation
    try {
      const start = new Date(appointment.startTime);
      const dateStr = start.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
      });
      const timeStr = start.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      await this.notificationsService.send({
        businessId: business.id,
        customerId: customer.id,
        templateId: 'APPOINTMENT_CONFIRMATION',
        variables: {
          customerName: customer.name,
          date: dateStr,
          time: timeStr,
          serviceName: appointment.service.name,
          businessName: business.name,
        },
      });
    } catch {
      // Don't fail the checkout if notification queuing has issues
    }

    return appointment;
  }
}
