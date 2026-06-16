import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { WorkingHoursMap } from '../business/dto/working-hours.dto';
import { RefundStatus } from '../../generated/prisma';

@Injectable()
export class AnalyticsService {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const redisUrl = this.configService.getOrThrow<string>('REDIS_URL');
    this.redis = new Redis(redisUrl);
  }

  /**
   * Parses and validates date range parameters, defaulting to the last 30 days.
   */
  parseDates(query: DashboardQueryDto) {
    const end = query.endDate ? new Date(query.endDate) : new Date();
    const start = query.startDate
      ? new Date(query.startDate)
      : new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);

    // Set boundaries to cover full days
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('Start date cannot be after end date');
    }

    const days = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
    );

    return { start, end, days };
  }

  /**
   * Helper to retrieve net revenue values.
   */
  async getNetRevenue(businessId: string, start: Date, end: Date) {
    const grossSum = await this.prisma.payment.aggregate({
      where: {
        businessId,
        status: 'SUCCESS',
        createdAt: { gte: start, lte: end },
      },
      _sum: { amount: true },
    });
    const grossVal = Number(grossSum._sum?.amount || 0);

    const refundsSum = await this.prisma.refund.aggregate({
      where: {
        businessId,
        status: RefundStatus.PROCESSED,
        createdAt: { gte: start, lte: end },
      },
      _sum: { amount: true },
    });
    const refundVal = Number(refundsSum._sum?.amount || 0);

    return {
      gross: grossVal,
      refunds: refundVal,
      net: grossVal - refundVal,
    };
  }

  /**
   * Helper to retrieve appointment counts and ratios.
   */
  async getAppointmentMetrics(
    businessId: string,
    start: Date,
    end: Date,
    days: number,
  ) {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        businessId,
        startTime: { gte: start, lte: end },
        deletedAt: null,
      },
      select: {
        status: true,
      },
    });

    const total = appointments.length;
    const completed = appointments.filter(
      (a) => a.status === 'COMPLETED',
    ).length;
    const cancelled = appointments.filter(
      (a) => a.status === 'CANCELLED',
    ).length;
    const noShow = appointments.filter((a) => a.status === 'NO_SHOW').length;

    const cancellationRate = total > 0 ? (cancelled / total) * 100 : 0;
    const noShowRate = total > 0 ? (noShow / total) * 100 : 0;
    const avgPerDay = completed / days;

    return {
      total,
      completed,
      cancelled,
      noShow,
      cancellationRate,
      noShowRate,
      avgPerDay,
    };
  }

  /**
   * Helper to calculate customer repeat rates and CLV values.
   */
  async getCustomerMetrics(businessId: string, start: Date, end: Date) {
    const totalCustomers = await this.prisma.customer.count({
      where: { businessId, deletedAt: null },
    });

    const newCustomers = await this.prisma.customer.count({
      where: {
        businessId,
        createdAt: { gte: start, lte: end },
        deletedAt: null,
      },
    });

    // Repeat rate: (Returning Customers / Unique Customers who booked completed appointments in period)
    const periodCompleted = await this.prisma.appointment.findMany({
      where: {
        businessId,
        status: 'COMPLETED',
        startTime: { gte: start, lte: end },
        deletedAt: null,
      },
      select: {
        customerId: true,
      },
    });

    const uniqueCustIds = Array.from(
      new Set(periodCompleted.map((a) => a.customerId)),
    );

    let returningCount = 0;
    if (uniqueCustIds.length > 0) {
      const counts = await this.prisma.appointment.groupBy({
        by: ['customerId'],
        where: {
          businessId,
          customerId: { in: uniqueCustIds },
          status: 'COMPLETED',
          deletedAt: null,
        },
        _count: { id: true },
      });
      returningCount = counts.filter((c) => c._count.id >= 2).length;
    }

    const repeatRate =
      uniqueCustIds.length > 0
        ? (returningCount / uniqueCustIds.length) * 100
        : 0;

    // CLV: Total Successful Payments / Total Active Customers
    const paymentsSum = await this.prisma.payment.aggregate({
      where: {
        businessId,
        status: 'SUCCESS',
      },
      _sum: { amount: true },
    });
    const clv =
      totalCustomers > 0
        ? Number(paymentsSum._sum?.amount || 0) / totalCustomers
        : 0;

    return {
      totalCustomers,
      newCustomers,
      returningCustomers: returningCount,
      repeatRate,
      clv,
    };
  }

  /**
   * Computes staff working minutes capacity in a range minus any overlapping leaves.
   */
  getStaffCapacityMinutes(
    staff: { id: string; workingHours: unknown },
    start: Date,
    end: Date,
    leaves: { staffId: string; startTime: Date; endTime: Date }[],
  ): number {
    const workingHours = staff.workingHours as WorkingHoursMap;
    if (!workingHours) return 0;

    let totalCapacity = 0;
    const current = new Date(start);
    current.setHours(12, 0, 0, 0); // avoid DST transitions

    const targetEnd = new Date(end);
    targetEnd.setHours(12, 0, 0, 0);

    const daysOfWeek = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];

    let limit = 0;
    while (current.getTime() <= targetEnd.getTime() && limit < 366) {
      limit++;
      const weekday = daysOfWeek[current.getDay()] as keyof WorkingHoursMap;
      const dayHours = workingHours[weekday];

      if (dayHours && dayHours.open && dayHours.close) {
        const [openH, openM] = dayHours.open.split(':').map(Number);
        const [closeH, closeM] = dayHours.close.split(':').map(Number);
        const openMinutes = openH * 60 + openM;
        const closeMinutes = closeH * 60 + closeM;
        let shiftCapacity = Math.max(0, closeMinutes - openMinutes);

        // Define shift intervals for leave overlap checks
        const dayStart = new Date(current);
        dayStart.setHours(openH, openM, 0, 0);
        const dayEnd = new Date(current);
        dayEnd.setHours(closeH, closeM, 0, 0);

        const staffLeaves = leaves.filter((l) => l.staffId === staff.id);
        for (const leave of staffLeaves) {
          const leaveStart = new Date(leave.startTime);
          const leaveEnd = new Date(leave.endTime);

          const overlapStart = leaveStart > dayStart ? leaveStart : dayStart;
          const overlapEnd = leaveEnd < dayEnd ? leaveEnd : dayEnd;

          if (overlapStart < overlapEnd) {
            const overlapMinutes = Math.ceil(
              (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60),
            );
            shiftCapacity -= overlapMinutes;
          }
        }
        totalCapacity += Math.max(0, shiftCapacity);
      }

      current.setDate(current.getDate() + 1);
    }

    return totalCapacity;
  }

  /**
   * Helper to retrieve staff bookings and utilization ratios.
   */
  async getStaffMetrics(businessId: string, start: Date, end: Date) {
    const staffList = await this.prisma.staff.findMany({
      where: { businessId, isActive: true, deletedAt: null },
    });

    const appointments = await this.prisma.appointment.findMany({
      where: {
        businessId,
        startTime: { gte: start, lte: end },
        status: { in: ['CONFIRMED', 'COMPLETED', 'RESCHEDULED'] },
        deletedAt: null,
      },
      include: {
        service: true,
      },
    });

    const leaves = await this.prisma.leave.findMany({
      where: {
        businessId,
        deletedAt: null,
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });

    const staffMetrics = staffList.map((staff) => {
      const staffAppointments = appointments.filter(
        (a) => a.staffId === staff.id,
      );
      const bookedMinutes = staffAppointments.reduce(
        (acc, a) => acc + a.service.duration,
        0,
      );
      const capacityMinutes = this.getStaffCapacityMinutes(
        staff,
        start,
        end,
        leaves,
      );
      const utilization =
        capacityMinutes > 0 ? (bookedMinutes / capacityMinutes) * 100 : 0;
      const completed = staffAppointments.filter(
        (a) => a.status === 'COMPLETED',
      ).length;

      return {
        staffId: staff.id,
        name: staff.name,
        bookedMinutes,
        capacityMinutes,
        utilization,
        completedAppointments: completed,
      };
    });

    const totalBooked = staffMetrics.reduce(
      (sum, s) => sum + s.bookedMinutes,
      0,
    );
    const totalCapacity = staffMetrics.reduce(
      (sum, s) => sum + s.capacityMinutes,
      0,
    );
    const overallUtilization =
      totalCapacity > 0 ? (totalBooked / totalCapacity) * 100 : 0;

    return {
      staffList: staffMetrics,
      overallUtilization,
      activeStaffCount: staffList.length,
    };
  }

  /**
   * Helper to retrieve campaign analytics.
   */
  async getMarketingMetrics(businessId: string, start: Date, end: Date) {
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        businessId,
        createdAt: { gte: start, lte: end },
        deletedAt: null,
      },
    });

    const sent = campaigns.reduce((acc, c) => acc + c.sentCount, 0);
    const delivered = campaigns.reduce((acc, c) => acc + c.deliveredCount, 0);
    const clicks = campaigns.reduce((acc, c) => acc + c.clickCount, 0);
    const campaignRevenue = campaigns.reduce(
      (acc, c) => acc + Number(c.revenueAttributed || 0),
      0,
    );

    const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;
    const ctr = delivered > 0 ? (clicks / delivered) * 100 : 0;

    return {
      sentCount: sent,
      deliveredCount: delivered,
      clickCount: clicks,
      deliveryRate,
      ctr,
      campaignRevenue,
    };
  }

  /**
   * Helper to retrieve growth calculations (current month vs previous month).
   */
  async getGrowthMetrics(businessId: string) {
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );

    const currentRevenue = await this.getNetRevenue(
      businessId,
      startOfCurrentMonth,
      now,
    );
    const prevRevenue = await this.getNetRevenue(
      businessId,
      startOfPrevMonth,
      endOfPrevMonth,
    );

    const monthlyRevenueGrowth =
      prevRevenue.net > 0
        ? ((currentRevenue.net - prevRevenue.net) / prevRevenue.net) * 100
        : 0;

    const currentNewCust = await this.prisma.customer.count({
      where: {
        businessId,
        createdAt: { gte: startOfCurrentMonth, lte: now },
        deletedAt: null,
      },
    });
    const prevNewCust = await this.prisma.customer.count({
      where: {
        businessId,
        createdAt: { gte: startOfPrevMonth, lte: endOfPrevMonth },
        deletedAt: null,
      },
    });
    const prevTotalCust = await this.prisma.customer.count({
      where: {
        businessId,
        createdAt: { lt: startOfCurrentMonth },
        deletedAt: null,
      },
    });

    const customerGrowth =
      prevTotalCust > 0
        ? ((currentNewCust - prevNewCust) / prevTotalCust) * 100
        : 0;

    return {
      monthlyRevenueGrowth,
      customerGrowth,
    };
  }

  /**
   * Owner Dashboard Metrics - Cached for 5 minutes.
   */
  async getOwnerDashboard(
    businessId: string,
    query: DashboardQueryDto,
    bypassCache = false,
  ): Promise<Record<string, unknown>> {
    const { start, end, days } = this.parseDates(query);
    const cacheKey = `analytics:owner:${businessId}:${start.toISOString()}:${end.toISOString()}`;

    if (!bypassCache) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as Record<string, unknown>;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [
      todayRevenue,
      todayAppointments,
      periodRevenue,
      appointmentMetrics,
      customerMetrics,
      staffMetrics,
      growthMetrics,
      recentActivity,
      upcomingAppointments,
    ] = await Promise.all([
      this.getNetRevenue(businessId, todayStart, todayEnd),
      this.prisma.appointment.count({
        where: {
          businessId,
          startTime: { gte: todayStart, lte: todayEnd },
          deletedAt: null,
        },
      }),
      this.getNetRevenue(businessId, start, end),
      this.getAppointmentMetrics(businessId, start, end, days),
      this.getCustomerMetrics(businessId, start, end),
      this.getStaffMetrics(businessId, start, end),
      this.getGrowthMetrics(businessId),
      this.prisma.appointment.findMany({
        where: { businessId, deletedAt: null },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { customer: true, service: true, staff: true },
      }),
      this.prisma.appointment.findMany({
        where: {
          businessId,
          startTime: { gte: new Date() },
          status: { in: ['CONFIRMED', 'RESCHEDULED'] },
          deletedAt: null,
        },
        take: 5,
        orderBy: { startTime: 'asc' },
        include: { customer: true, service: true, staff: true },
      }),
    ]);

    const data = {
      today: {
        revenue: todayRevenue.net,
        appointments: todayAppointments,
      },
      revenue: periodRevenue,
      appointments: appointmentMetrics,
      customers: customerMetrics,
      staff: {
        utilization: staffMetrics.overallUtilization,
        revenuePerStaff:
          staffMetrics.activeStaffCount > 0
            ? periodRevenue.net / staffMetrics.activeStaffCount
            : 0,
        appointmentsPerStaff:
          staffMetrics.activeStaffCount > 0
            ? appointmentMetrics.completed / staffMetrics.activeStaffCount
            : 0,
      },
      growth: growthMetrics,
      recentActivity,
      upcomingAppointments,
    };

    await this.redis.set(cacheKey, JSON.stringify(data), 'EX', 300);
    return data;
  }

  /**
   * Manager Dashboard Metrics - Cached for 5 minutes.
   */
  async getManagerDashboard(
    businessId: string,
    query: DashboardQueryDto,
    bypassCache = false,
  ): Promise<Record<string, unknown>> {
    const { start, end } = this.parseDates(query);
    const cacheKey = `analytics:manager:${businessId}:${start.toISOString()}:${end.toISOString()}`;

    if (!bypassCache) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as Record<string, unknown>;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Fetch active staff roster
    const activeStaff = await this.prisma.staff.findMany({
      where: { businessId, isActive: true, deletedAt: null },
      select: { id: true, name: true, phone: true, workingHours: true },
    });

    const [todayAppointments, pendingPaymentsSum, customerFollowUps] =
      await Promise.all([
        this.prisma.appointment.findMany({
          where: {
            businessId,
            startTime: { gte: todayStart, lte: todayEnd },
            deletedAt: null,
          },
          include: { customer: true, service: true, staff: true },
          orderBy: { startTime: 'asc' },
        }),
        this.prisma.payment.aggregate({
          where: { businessId, status: 'PENDING' },
          _sum: { amount: true },
          _count: { id: true },
        }),
        // Follow ups: Customers who had completed appointments in the last 30 days
        // but have NO future appointments scheduled.
        this.prisma.$queryRawUnsafe<any[]>(
          `
          SELECT c.id, c.name, c.phone, c.email
          FROM customers c
          WHERE c.business_id = $1::uuid AND c.deleted_at IS NULL
            AND EXISTS (
              SELECT 1 FROM appointments a
              WHERE a.customer_id = c.id AND a.status = 'COMPLETED'
                AND a.start_time >= $2::timestamptz AND a.deleted_at IS NULL
            )
            AND NOT EXISTS (
              SELECT 1 FROM appointments a
              WHERE a.customer_id = c.id AND a.status IN ('CONFIRMED', 'RESCHEDULED')
                AND a.start_time >= $3::timestamptz AND a.deleted_at IS NULL
            )
          LIMIT 20
        `,
          businessId,
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          new Date(),
        ),
      ]);

    const data = {
      todayAppointments,
      activeStaff,
      pendingPayments: {
        count: pendingPaymentsSum._count.id,
        amount: Number(pendingPaymentsSum._sum?.amount || 0),
      },
      customerFollowUps,
    };

    await this.redis.set(cacheKey, JSON.stringify(data), 'EX', 300);
    return data;
  }

  /**
   * Reception Dashboard Metrics - Cached for 1 minute.
   */
  async getReceptionDashboard(
    businessId: string,
    query: DashboardQueryDto,
    bypassCache = false,
  ): Promise<Record<string, unknown>> {
    const { start, end } = this.parseDates(query);
    const cacheKey = `analytics:reception:${businessId}:${start.toISOString()}:${end.toISOString()}`;

    if (!bypassCache) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as Record<string, unknown>;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const fourHoursLater = new Date();
    fourHoursLater.setHours(fourHoursLater.getHours() + 4);

    const [todayAppointments, upcomingAppointments, pendingCollection] =
      await Promise.all([
        this.prisma.appointment.findMany({
          where: {
            businessId,
            startTime: { gte: todayStart, lte: todayEnd },
            deletedAt: null,
          },
          include: { customer: true, service: true, staff: true },
          orderBy: { startTime: 'asc' },
        }),
        this.prisma.appointment.findMany({
          where: {
            businessId,
            startTime: { gte: new Date(), lte: fourHoursLater },
            status: { in: ['CONFIRMED', 'RESCHEDULED'] },
            deletedAt: null,
          },
          include: { customer: true, service: true, staff: true },
          orderBy: { startTime: 'asc' },
        }),
        this.prisma.payment.aggregate({
          where: {
            businessId,
            status: 'PENDING',
            appointment: { startTime: { gte: todayStart, lte: todayEnd } },
          },
          _count: { id: true },
          _sum: { amount: true },
        }),
      ]);

    const data = {
      calendar: todayAppointments,
      upcoming: upcomingAppointments,
      checkInQueue: todayAppointments.filter(
        (a) => a.status === 'CONFIRMED' || a.status === 'RESCHEDULED',
      ),
      pendingCollection: {
        count: pendingCollection._count.id,
        amount: Number(pendingCollection._sum?.amount || 0),
      },
    };

    await this.redis.set(cacheKey, JSON.stringify(data), 'EX', 60);
    return data;
  }

  /**
   * Staff Dashboard Metrics - Cached for 5 minutes.
   */
  async getStaffDashboard(
    businessId: string,
    memberId: string,
    query: DashboardQueryDto,
    bypassCache = false,
  ): Promise<Record<string, unknown>> {
    const staff = await this.prisma.staff.findFirst({
      where: { memberId, businessId, deletedAt: null },
    });

    if (!staff) {
      throw new ForbiddenException('User is not linked to a staff profile');
    }

    const { start, end } = this.parseDates(query);
    const cacheKey = `analytics:staff:${businessId}:${staff.id}:${start.toISOString()}:${end.toISOString()}`;

    if (!bypassCache) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as Record<string, unknown>;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [todayAppointments, upcomingAppointments, staffAppointments, leaves] =
      await Promise.all([
        this.prisma.appointment.findMany({
          where: {
            businessId,
            staffId: staff.id,
            startTime: { gte: todayStart, lte: todayEnd },
            deletedAt: null,
          },
          include: { customer: true, service: true },
          orderBy: { startTime: 'asc' },
        }),
        this.prisma.appointment.findMany({
          where: {
            businessId,
            staffId: staff.id,
            startTime: { gte: new Date() },
            status: { in: ['CONFIRMED', 'RESCHEDULED'] },
            deletedAt: null,
          },
          take: 5,
          orderBy: { startTime: 'asc' },
          include: { customer: true, service: true },
        }),
        this.prisma.appointment.findMany({
          where: {
            businessId,
            staffId: staff.id,
            startTime: { gte: start, lte: end },
            status: { in: ['CONFIRMED', 'COMPLETED', 'RESCHEDULED'] },
            deletedAt: null,
          },
          include: { service: true },
        }),
        this.prisma.leave.findMany({
          where: {
            businessId,
            staffId: staff.id,
            deletedAt: null,
            startTime: { lt: end },
            endTime: { gt: start },
          },
        }),
      ]);

    const bookedMinutes = staffAppointments.reduce(
      (acc, a) => acc + a.service.duration,
      0,
    );
    const capacityMinutes = this.getStaffCapacityMinutes(
      staff,
      start,
      end,
      leaves,
    );
    const utilization =
      capacityMinutes > 0 ? (bookedMinutes / capacityMinutes) * 100 : 0;
    const completedCount = staffAppointments.filter(
      (a) => a.status === 'COMPLETED',
    ).length;

    // Completed revenue calculation
    const completedAptIds = staffAppointments
      .filter((a) => a.status === 'COMPLETED')
      .map((a) => a.id);

    let ownRevenue = 0;
    if (completedAptIds.length > 0) {
      const revenueSum = await this.prisma.payment.aggregate({
        where: {
          businessId,
          appointmentId: { in: completedAptIds },
          status: 'SUCCESS',
        },
        _sum: { amount: true },
      });
      ownRevenue = Number(revenueSum._sum?.amount || 0);
    }

    // Determine availability today
    const daysOfWeek = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    const weekday = daysOfWeek[todayStart.getDay()] as keyof WorkingHoursMap;
    const workingHours = staff.workingHours as WorkingHoursMap;
    const isWorkingToday = workingHours?.[weekday] !== null && staff.isActive;

    const data = {
      todayAppointments,
      upcomingAppointments,
      performance: {
        completedAppointments: completedCount,
        bookedMinutes,
        capacityMinutes,
        utilization,
        revenue: ownRevenue,
      },
      isWorkingToday,
    };

    await this.redis.set(cacheKey, JSON.stringify(data), 'EX', 300);
    return data;
  }
}
