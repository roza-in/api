import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus } from '../../generated/prisma';
import { WorkingHoursMap, DayHours } from '../business/dto/working-hours.dto';

@Injectable()
export class ConflictService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to format a Date into local day of week and 24h time parts (HH:mm) for a specific timezone.
   */
  getLocalDayAndTime(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const dayOfWeek = parts
      .find((p) => p.type === 'weekday')
      ?.value.toLowerCase();
    let hour = parts.find((p) => p.type === 'hour')?.value || '00';
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';

    if (!dayOfWeek) {
      throw new Error(
        `Failed to parse local weekday for date ${date.toISOString()} in timezone ${timezone}`,
      );
    }

    // Node.js hour12: false formatting quirk handling
    if (hour === '24') {
      hour = '00';
    }

    return {
      dayOfWeek,
      timeStr: `${hour}:${minute}`,
    };
  }

  /**
   * Evaluates if a proposed appointment has any conflicts.
   */
  async checkConflict(
    businessId: string,
    details: {
      branchId: string;
      staffId: string;
      serviceId: string;
      startTime: string | Date;
      ignoreAppointmentId?: string;
    },
  ) {
    const { branchId, staffId, serviceId, startTime, ignoreAppointmentId } =
      details;

    // 1. Resolve target Branch, Staff, and Service
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, businessId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const staff = await this.prisma.staff.findFirst({
      where: {
        id: staffId,
        businessId,
        branchId,
        isActive: true,
        deletedAt: null,
      },
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found or is inactive');
    }

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, businessId, deletedAt: null },
    });
    if (!service) {
      throw new NotFoundException('Service not found or is inactive');
    }

    // 2. Check that the staff member is assigned to the service
    const linkage = await this.prisma.staffService.findUnique({
      where: { staffId_serviceId: { staffId, serviceId } },
    });
    if (!linkage) {
      throw new BadRequestException(
        'Staff member is not assigned to this service',
      );
    }

    // 3. Calculate times
    const pStart = new Date(startTime);
    const durationMs = service.duration * 60 * 1000;
    const pEnd = new Date(pStart.getTime() + durationMs);
    const bufferMs = service.bufferTime * 60 * 1000;
    const pEndWithBuffer = new Date(pStart.getTime() + durationMs + bufferMs);

    // 4. Timezone operating hours checks
    const startLocal = this.getLocalDayAndTime(pStart, branch.timezone);
    const endLocal = this.getLocalDayAndTime(pEnd, branch.timezone);

    if (startLocal.dayOfWeek !== endLocal.dayOfWeek) {
      throw new ConflictException(
        'Appointment cannot cross midnight local timezone',
      );
    }

    const dayOfWeek = startLocal.dayOfWeek;
    const branchHours = branch.workingHours as unknown as WorkingHoursMap;
    const staffHours = staff.workingHours as unknown as WorkingHoursMap;

    const branchDayHours: DayHours | null = branchHours?.[dayOfWeek];
    const staffDayHours: DayHours | null = staffHours?.[dayOfWeek];

    if (!branchDayHours) {
      throw new ConflictException(`Branch is closed on ${dayOfWeek}`);
    }
    if (!staffDayHours) {
      throw new ConflictException(
        `Staff member is not working on ${dayOfWeek}`,
      );
    }

    if (
      startLocal.timeStr < branchDayHours.open ||
      endLocal.timeStr > branchDayHours.close
    ) {
      throw new ConflictException(
        `Appointment is outside branch operating hours (${branchDayHours.open} - ${branchDayHours.close})`,
      );
    }

    if (
      startLocal.timeStr < staffDayHours.open ||
      endLocal.timeStr > staffDayHours.close
    ) {
      throw new ConflictException(
        `Appointment is outside staff working hours (${staffDayHours.open} - ${staffDayHours.close})`,
      );
    }

    // 5. Verify the staff is not on leave during [pStart, pEnd]
    const overlappingLeave = await this.prisma.leave.findFirst({
      where: {
        staffId,
        deletedAt: null,
        startTime: { lt: pEnd },
        endTime: { gt: pStart },
      },
    });
    if (overlappingLeave) {
      throw new ConflictException(
        'Staff member is on leave during this period',
      );
    }

    // 6. Verify overlapping non-cancelled appointments (accounting for buffers)
    const candidateAppointments = await this.prisma.appointment.findMany({
      where: {
        staffId,
        status: { not: AppointmentStatus.CANCELLED },
        id: ignoreAppointmentId ? { not: ignoreAppointmentId } : undefined,
        startTime: {
          gte: new Date(pStart.getTime() - 24 * 60 * 60 * 1000),
          lte: new Date(pEnd.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      include: {
        service: true,
      },
    });

    for (const appt of candidateAppointments) {
      const eStart = new Date(appt.startTime);
      const eEnd = new Date(appt.endTime);
      const eBufferMs = appt.service.bufferTime * 60 * 1000;
      const eEndWithBuffer = new Date(eEnd.getTime() + eBufferMs);

      // Overlap formula: proposed start < existing end with buffer AND proposed end with buffer > existing start
      if (pStart < eEndWithBuffer && pEndWithBuffer > eStart) {
        throw new ConflictException(
          'Staff member has an overlapping appointment (including buffer time)',
        );
      }
    }

    return {
      branch,
      staff,
      service,
      pStart,
      pEnd,
      pEndWithBuffer,
    };
  }
}
