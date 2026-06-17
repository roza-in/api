import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictService } from './conflict.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentSearchDto } from './dto/appointment-search.dto';
import { AppointmentStatus, Prisma } from '../../generated/prisma';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conflictService: ConflictService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Create a new appointment, running conflict validations and logging the audit trail.
   */
  async createAppointment(
    businessId: string,
    userId: string | null,
    dto: CreateAppointmentDto,
  ) {
    // 1. Verify Customer exists and belongs to the business
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, businessId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Resolve auditing creatorId for public bookings
    let creatorId = userId;
    if (!creatorId) {
      const ownerMember = await this.prisma.businessMember.findFirst({
        where: { businessId, role: { name: 'OWNER' } },
      });
      if (ownerMember) {
        creatorId = ownerMember.userId;
      } else {
        const anyMember = await this.prisma.businessMember.findFirst({
          where: { businessId },
        });
        creatorId = anyMember?.userId || '00000000-0000-0000-0000-000000000000';
      }
    }

    // 2. Delegate conflict checks (handles branch, staff, service validations)
    const validation = await this.conflictService.checkConflict(businessId, {
      branchId: dto.branchId,
      staffId: dto.staffId,
      serviceId: dto.serviceId,
      startTime: dto.startTime,
    });

    // 3. Create appointment record
    const appointment = await this.prisma.appointment.create({
      data: {
        businessId,
        branchId: dto.branchId,
        staffId: dto.staffId,
        customerId: dto.customerId,
        serviceId: dto.serviceId,
        startTime: validation.pStart,
        endTime: validation.pEnd,
        status: AppointmentStatus.CONFIRMED,
        notes: dto.notes,
        createdBy: creatorId,
        updatedBy: creatorId,
      },
      include: {
        branch: true,
        staff: true,
        customer: true,
        service: true,
        business: true,
      },
    });

    // 4. Create Audit Log entry
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: creatorId,
        action: 'CREATE',
        entity: 'Appointment',
        entityId: appointment.id,
        metadata: {
          startTime: appointment.startTime,
          staffId: appointment.staffId,
          serviceId: appointment.serviceId,
        },
      },
    });

    // 5. Trigger Confirmation Notification
    try {
      const timezone = appointment.branch.timezone || 'Asia/Kolkata';
      const dateStr = new Intl.DateTimeFormat('en-IN', {
        timeZone: timezone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(appointment.startTime).replace(/\//g, '-');

      const timeStr = new Intl.DateTimeFormat('en-IN', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(appointment.startTime);

      await this.notificationsService.send({
        businessId,
        customerId: appointment.customerId,
        templateId: 'APPOINTMENT_CONFIRMATION',
        variables: {
          customerName: appointment.customer.name,
          date: dateStr,
          time: timeStr,
          serviceName: appointment.service.name,
          businessName: appointment.business.name,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to trigger confirmation notification for appointment ${appointment.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return appointment;
  }

  /**
   * Fetch paginated list of appointments with filters.
   */
  async findAll(businessId: string, query: AppointmentSearchDto) {
    const where: Prisma.AppointmentWhereInput = {
      businessId,
      deletedAt: null,
    };

    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.staffId) {
      where.staffId = query.staffId;
    }
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate || query.endDate) {
      where.startTime = {};
      if (query.startDate) {
        where.startTime.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.startTime.lte = new Date(query.endDate);
      }
    }

    const skip = (query.page! - 1) * query.limit!;
    const take = query.limit!;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        skip,
        take,
        include: {
          branch: true,
          staff: true,
          customer: true,
          service: true,
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      items,
      total,
      page: query.page!,
      limit: query.limit!,
    };
  }

  /**
   * Retrieve a single appointment by ID.
   */
  async findOne(businessId: string, id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, businessId, deletedAt: null },
      include: {
        branch: true,
        staff: true,
        customer: true,
        service: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  /**
   * Update or reschedule an appointment, implementing version checks and status progression.
   */
  async updateAppointment(
    businessId: string,
    userId: string,
    id: string,
    dto: UpdateAppointmentDto,
  ) {
    // 1. Fetch existing record and assert concurrency version match
    const existing = await this.prisma.appointment.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }
    if (existing.version !== dto.version) {
      throw new ConflictException(
        'Record was modified by another user. Please refresh and try again.',
      );
    }

    // Determine target values
    const branchId = dto.branchId || existing.branchId;
    const staffId = dto.staffId || existing.staffId;
    const serviceId = dto.serviceId || existing.serviceId;
    const startTime = dto.startTime || existing.startTime;

    const timeOrResourceChanged =
      branchId !== existing.branchId ||
      staffId !== existing.staffId ||
      serviceId !== existing.serviceId ||
      new Date(startTime).getTime() !== new Date(existing.startTime).getTime();

    let pStart = new Date(existing.startTime);
    let pEnd = new Date(existing.endTime);

    // 2. Validate conflicts if schedule properties are changing
    if (timeOrResourceChanged) {
      const validation = await this.conflictService.checkConflict(businessId, {
        branchId,
        staffId,
        serviceId,
        startTime,
        ignoreAppointmentId: id,
      });
      pStart = validation.pStart;
      pEnd = validation.pEnd;
    }

    // Determine status: transition to RESCHEDULED if scheduling elements changed and status was not explicitly updated
    let status = dto.status || existing.status;
    if (
      timeOrResourceChanged &&
      !dto.status &&
      existing.status === AppointmentStatus.CONFIRMED
    ) {
      status = AppointmentStatus.RESCHEDULED;
    }

    // Append cancellation reason to notes if status changed to CANCELLED
    let notes = dto.notes !== undefined ? dto.notes : existing.notes;
    if (dto.status === AppointmentStatus.CANCELLED && dto.cancellationReason) {
      const reasonText = `Cancellation Reason: ${dto.cancellationReason}`;
      notes = notes ? `${notes}\n${reasonText}` : reasonText;
    }

    // 3. Atomically update records using updateMany to guarantee version safety
    const updateResult = await this.prisma.appointment.updateMany({
      where: { id, businessId, version: dto.version, deletedAt: null },
      data: {
        branchId,
        staffId,
        customerId: dto.customerId || existing.customerId,
        serviceId,
        startTime: timeOrResourceChanged ? pStart : undefined,
        endTime: timeOrResourceChanged ? pEnd : undefined,
        status,
        notes,
        updatedBy: userId,
        version: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException(
        'Record was modified by another user. Please refresh and try again.',
      );
    }

    // Fetch the freshly updated record
    const updated = await this.prisma.appointment.findUniqueOrThrow({
      where: { id },
      include: {
        branch: true,
        staff: true,
        customer: true,
        service: true,
        business: true,
      },
    });

    // 4. Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId,
        action: 'UPDATE',
        entity: 'Appointment',
        entityId: id,
        metadata: {
          oldValue: {
            startTime: existing.startTime,
            staffId: existing.staffId,
            status: existing.status,
            notes: existing.notes,
          },
          newValue: {
            startTime: updated.startTime,
            staffId: updated.staffId,
            status: updated.status,
            notes: updated.notes,
          },
        },
      },
    });

    // 5. Trigger Reschedule or Cancel Notifications
    const timezone = updated.branch.timezone || 'Asia/Kolkata';

    const formatDateStr = (date: Date) =>
      new Intl.DateTimeFormat('en-IN', {
        timeZone: timezone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(date).replace(/\//g, '-');

    const formatTimeStr = (date: Date) =>
      new Intl.DateTimeFormat('en-IN', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(date);

    if (updated.status === AppointmentStatus.CANCELLED) {
      try {
        await this.notificationsService.send({
          businessId,
          customerId: updated.customerId,
          templateId: 'APPOINTMENT_CANCELLED',
          variables: {
            customerName: updated.customer.name,
            date: formatDateStr(updated.startTime),
            time: formatTimeStr(updated.startTime),
            serviceName: updated.service.name,
            businessName: updated.business.name,
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to trigger cancel notification for appointment ${updated.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    } else if (
      updated.status === AppointmentStatus.RESCHEDULED ||
      new Date(existing.startTime).getTime() !== new Date(updated.startTime).getTime()
    ) {
      try {
        await this.notificationsService.send({
          businessId,
          customerId: updated.customerId,
          templateId: 'APPOINTMENT_RESCHEDULED',
          variables: {
            customerName: updated.customer.name,
            oldDate: formatDateStr(existing.startTime),
            oldTime: formatTimeStr(existing.startTime),
            newDate: formatDateStr(updated.startTime),
            newTime: formatTimeStr(updated.startTime),
            serviceName: updated.service.name,
            businessName: updated.business.name,
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to trigger reschedule notification for appointment ${updated.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return updated;
  }

  /**
   * Soft delete an appointment and log the audit entry.
   */
  async softDelete(businessId: string, userId: string, id: string) {
    const existing = await this.prisma.appointment.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }

    await this.prisma.appointment.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedBy: userId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId,
        action: 'DELETE',
        entity: 'Appointment',
        entityId: id,
        metadata: {
          deletedAt: new Date(),
        },
      },
    });

    return { message: 'Appointment deleted successfully' };
  }
}
