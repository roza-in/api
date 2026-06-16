import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { AppointmentStatus } from '../../generated/prisma';
import type { Staff } from '../../generated/prisma';
import { WorkingHoursMap, DayHours } from '../business/dto/working-hours.dto';

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to parse "HH:mm" to minutes since midnight.
   */
  private parseTimeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Helper to format minutes since midnight to "HH:mm" string.
   */
  private formatMinutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  /**
   * Helper to construct a UTC Date from a local date string and time string in a target timezone.
   */
  private getUtcDateFromLocal(
    dateStr: string,
    timeStr: string,
    timezone: string,
  ): Date {
    const candidate = new Date(`${dateStr}T${timeStr}:00.000Z`);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(candidate);
    const y = parseInt(parts.find((p) => p.type === 'year')!.value);
    const m = parseInt(parts.find((p) => p.type === 'month')!.value);
    const d = parseInt(parts.find((p) => p.type === 'day')!.value);
    const hStr = parts.find((p) => p.type === 'hour')!.value;
    const minStr = parts.find((p) => p.type === 'minute')!.value;

    let h = parseInt(hStr);
    if (hStr === '24') {
      h = 0;
    }
    const min = parseInt(minStr);

    const localTime = Date.UTC(y, m - 1, d, h, min, 0);
    const diff = candidate.getTime() - localTime;
    return new Date(candidate.getTime() + diff);
  }

  /**
   * Helper to format a Date into local day of week and 24h time parts (HH:mm) for a specific timezone.
   */
  private getLocalDayAndTime(date: Date, timezone: string) {
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

    if (hour === '24') {
      hour = '00';
    }

    return {
      dayOfWeek,
      timeStr: `${hour}:${minute}`,
    };
  }

  /**
   * Calculates available scheduling slots for a branch, service, and date.
   */
  async getAvailableSlots(businessId: string, dto: AvailabilityQueryDto) {
    const { branchId, serviceId, date, staffId } = dto;

    // 1. Fetch branch and verify it exists
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, businessId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    // 2. Fetch service details
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, businessId, deletedAt: null },
    });
    if (!service) {
      throw new NotFoundException('Service not found or is inactive');
    }

    // 3. Fetch candidate staff members
    let staffCandidates: Staff[] = [];
    if (staffId) {
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
      const linkage = await this.prisma.staffService.findUnique({
        where: { staffId_serviceId: { staffId, serviceId } },
      });
      if (!linkage) {
        throw new BadRequestException(
          'Staff member is not assigned to this service',
        );
      }
      staffCandidates = [staff];
    } else {
      staffCandidates = await this.prisma.staff.findMany({
        where: {
          businessId,
          branchId,
          isActive: true,
          deletedAt: null,
          services: {
            some: { serviceId },
          },
        },
      });
    }

    if (staffCandidates.length === 0) {
      return [];
    }

    // Determine day of the week for the target local date
    const [year, month, day] = date.split('-').map(Number);
    const midDayUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const dayOfWeek = this.getLocalDayAndTime(
      midDayUtc,
      branch.timezone,
    ).dayOfWeek;

    // Set up safe UTC queries bounds covering timezone shifts (+- 24 hours around requested day)
    const queryStart = new Date(`${date}T00:00:00Z`);
    queryStart.setUTCDate(queryStart.getUTCDate() - 1);
    const queryEnd = new Date(`${date}T23:59:59Z`);
    queryEnd.setUTCDate(queryEnd.getUTCDate() + 1);

    const allSlots: { startTime: Date; endTime: Date; staffId: string }[] = [];

    // Calculate slots for each candidate staff member
    for (const staff of staffCandidates) {
      const branchHours = branch.workingHours as unknown as WorkingHoursMap;
      const staffHours = staff.workingHours as unknown as WorkingHoursMap;

      const branchDayHours: DayHours | null = branchHours?.[dayOfWeek];
      const staffDayHours: DayHours | null = staffHours?.[dayOfWeek];

      if (!branchDayHours || !staffDayHours) {
        continue; // Branch or staff is closed/off on this day
      }

      // Intersection of operating hours
      const openTimeStr =
        branchDayHours.open > staffDayHours.open
          ? branchDayHours.open
          : staffDayHours.open;
      const closeTimeStr =
        branchDayHours.close < staffDayHours.close
          ? branchDayHours.close
          : staffDayHours.close;

      if (openTimeStr >= closeTimeStr) {
        continue; // No intersecting hours
      }

      const openMinutes = this.parseTimeToMinutes(openTimeStr);
      const closeMinutes = this.parseTimeToMinutes(closeTimeStr);

      // Fetch existing appointments and leaves for this staff member
      const appointments = await this.prisma.appointment.findMany({
        where: {
          staffId: staff.id,
          status: { not: AppointmentStatus.CANCELLED },
          startTime: { lt: queryEnd },
          endTime: { gt: queryStart },
        },
        include: { service: true },
      });

      const leaves = await this.prisma.leave.findMany({
        where: {
          staffId: staff.id,
          deletedAt: null,
          startTime: { lt: queryEnd },
          endTime: { gt: queryStart },
        },
      });

      // Generate slots in 15-minute increments
      const slotDuration = service.duration;
      const slotBuffer = service.bufferTime;

      for (
        let startMinutes = openMinutes;
        startMinutes <= closeMinutes - slotDuration;
        startMinutes += 15
      ) {
        const startStr = this.formatMinutesToTime(startMinutes);
        const pStart = this.getUtcDateFromLocal(
          date,
          startStr,
          branch.timezone,
        );
        const pEnd = new Date(pStart.getTime() + slotDuration * 60 * 1000);
        const pEndWithBuffer = new Date(
          pStart.getTime() + (slotDuration + slotBuffer) * 60 * 1000,
        );

        // Check timezone operating hours boundary crossing (midnight check)
        const startLocal = this.getLocalDayAndTime(pStart, branch.timezone);
        const endLocal = this.getLocalDayAndTime(pEnd, branch.timezone);
        if (startLocal.dayOfWeek !== endLocal.dayOfWeek) {
          continue; // Crossed midnight
        }

        // Verify leaves overlap
        let onLeave = false;
        for (const leave of leaves) {
          const lStart = new Date(leave.startTime);
          const lEnd = new Date(leave.endTime);
          if (pStart < lEnd && pEnd > lStart) {
            onLeave = true;
            break;
          }
        }
        if (onLeave) {
          continue;
        }

        // Verify appointments overlap (respect buffer times of both sides)
        let hasConflict = false;
        for (const appt of appointments) {
          const eStart = new Date(appt.startTime);
          const eEnd = new Date(appt.endTime);
          const eBuffer = appt.service.bufferTime;
          const eEndWithBuffer = new Date(eEnd.getTime() + eBuffer * 60 * 1000);

          if (pStart < eEndWithBuffer && pEndWithBuffer > eStart) {
            hasConflict = true;
            break;
          }
        }
        if (hasConflict) {
          continue;
        }

        allSlots.push({
          startTime: pStart,
          endTime: pEnd,
          staffId: staff.id,
        });
      }
    }

    // Return combined list sorted chronologically
    return allSlots.sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );
  }
}
