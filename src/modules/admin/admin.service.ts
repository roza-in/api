import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  UpdateSystemStatusDto,
} from './dto/incidents.dto';
import {
  Incident,
  SystemStatus,
  Business,
  Prisma,
  SystemStatusType,
  IncidentStatus,
} from '../../generated/prisma';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDashboardMetrics() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Calculate MRR & ARR
    const activeSubscriptions = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE' },
    });

    let mrr = 0;
    activeSubscriptions.forEach((sub) => {
      const amount = Number(sub.amount);
      if (sub.billingInterval === 'yearly') {
        mrr += amount / 12;
      } else {
        mrr += amount;
      }
    });

    const arr = mrr * 12;

    // 2. Active, Trial, Suspended Business counts
    const activeCount = await this.prisma.business.count({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      },
    });

    const trialCount = await this.prisma.business.count({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        subscriptionStatus: 'TRIALING',
      },
    });

    const suspendedCount = await this.prisma.business.count({
      where: {
        deletedAt: null,
        status: 'SUSPENDED',
      },
    });

    // 3. ARPU
    const arpu = activeCount === 0 ? 0 : mrr / activeCount;

    // 4. Churn Rate
    const cancelledCount = await this.prisma.business.count({
      where: {
        deletedAt: null,
        subscriptionStatus: 'CANCELLED',
        updatedAt: { gte: thirtyDaysAgo },
      },
    });
    const churnRate =
      activeCount === 0 ? 0 : (cancelledCount / activeCount) * 100;

    // 5. Subscription growth tracking (last 30 days)
    const newCount = await this.prisma.subscription.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        status: 'ACTIVE',
      },
    });

    const audits = await this.prisma.auditLog.findMany({
      where: {
        entity: 'Subscription',
        action: 'UPDATE',
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    let upgrades = 0;
    let downgrades = 0;
    let renewals = 0;

    audits.forEach((audit) => {
      const meta = audit.metadata as unknown as { transition?: string } | null;
      if (meta?.transition === 'upgrade') upgrades++;
      else if (meta?.transition === 'downgrade') downgrades++;
      else if (meta?.transition === 'renew') renewals++;
    });

    return {
      mrr,
      arr,
      arpu,
      churnRate,
      businesses: {
        active: activeCount,
        trial: trialCount,
        suspended: suspendedCount,
        total: activeCount + trialCount + suspendedCount,
      },
      growth: {
        newSubscriptions: newCount,
        upgrades,
        downgrades,
        renewals,
        cancellations: cancelledCount,
      },
    };
  }

  // --- Business Management ---

  async findAllBusinesses(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.business.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.business.count({
        where: { deletedAt: null },
      }),
    ]);

    return { items, total };
  }

  async updateBusinessStatus(
    id: string,
    status: 'ACTIVE' | 'SUSPENDED',
    adminUserId: string,
  ): Promise<Business> {
    const business = await this.prisma.business.findUnique({
      where: { id },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const updated = await this.prisma.business.update({
      where: { id },
      data: { status, version: { increment: 1 } },
    });

    await this.prisma.auditLog.create({
      data: {
        businessId: id,
        userId: adminUserId,
        action: 'UPDATE',
        entity: 'Business',
        entityId: id,
        metadata: { status, trigger: 'admin_action' },
      },
    });

    return updated;
  }

  async extendTrial(
    id: string,
    extensionDays: number,
    adminUserId: string,
  ): Promise<Business> {
    const business = await this.prisma.business.findUnique({
      where: { id },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const currentTrialEnd = new Date(business.trialEndsAt);
    currentTrialEnd.setDate(currentTrialEnd.getDate() + extensionDays);

    const updated = await this.prisma.business.update({
      where: { id },
      data: {
        trialEndsAt: currentTrialEnd,
        version: { increment: 1 },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        businessId: id,
        userId: adminUserId,
        action: 'UPDATE',
        entity: 'Business',
        entityId: id,
        metadata: {
          extensionDays,
          newTrialEndsAt: currentTrialEnd,
          trigger: 'admin_action',
        },
      },
    });

    return updated;
  }

  // --- System Status Page ---

  async getSystemStatus(): Promise<SystemStatus[]> {
    const defaultComponents = [
      'api',
      'payments',
      'booking_engine',
      'notifications',
      'website_publishing',
      'infrastructure',
    ];

    const currentStatuses = await this.prisma.systemStatus.findMany();
    const statusMap = new Map(currentStatuses.map((s) => [s.component, s]));

    const result: SystemStatus[] = [];

    for (const comp of defaultComponents) {
      const existing = statusMap.get(comp);
      if (existing) {
        result.push(existing);
      } else {
        // Initialize if not in DB
        const dummy: SystemStatus = {
          id: comp, // dummy PK representation
          component: comp,
          status: SystemStatusType.OPERATIONAL,
          updatedAt: new Date(),
          updatedBy: '00000000-0000-0000-0000-000000000000',
        };
        result.push(dummy);
      }
    }

    return result;
  }

  async updateSystemStatus(
    component: string,
    dto: UpdateSystemStatusDto,
    adminUserId: string,
  ): Promise<SystemStatus> {
    const { status } = dto;

    return this.prisma.systemStatus.upsert({
      where: { component },
      update: { status, updatedBy: adminUserId },
      create: { component, status, updatedBy: adminUserId },
    });
  }

  // --- Incident Management ---

  async createIncident(dto: CreateIncidentDto): Promise<Incident> {
    const { severity, status, title, description, startedAt, isRepeat } = dto;

    return this.prisma.incident.create({
      data: {
        severity,
        status,
        title,
        description,
        startedAt: new Date(startedAt),
        isRepeat: isRepeat ?? false,
      },
    });
  }

  async updateIncident(id: string, dto: UpdateIncidentDto): Promise<Incident> {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
    });

    if (!incident) {
      throw new NotFoundException('Incident not found');
    }

    const data: Prisma.IncidentUpdateInput = {};

    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (
        dto.status === IncidentStatus.RESOLVED &&
        incident.status !== IncidentStatus.RESOLVED &&
        !dto.resolvedAt
      ) {
        data.resolvedAt = new Date();
      }
    }
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.startedAt !== undefined) data.startedAt = new Date(dto.startedAt);
    if (dto.resolvedAt !== undefined)
      data.resolvedAt = new Date(dto.resolvedAt);
    if (dto.responseTimeMs !== undefined)
      data.responseTimeMs = dto.responseTimeMs;
    if (dto.resolutionTimeMs !== undefined)
      data.resolutionTimeMs = dto.resolutionTimeMs;
    if (dto.cSatScore !== undefined) data.cSatScore = dto.cSatScore;
    if (dto.isRepeat !== undefined) data.isRepeat = dto.isRepeat;

    // Auto calculate resolutionTimeMs if resolvedAt and startedAt are resolved
    const resolved = (data.resolvedAt as Date) || incident.resolvedAt;
    const started = (data.startedAt as Date) || incident.startedAt;
    if (resolved && started && dto.resolutionTimeMs === undefined) {
      data.resolutionTimeMs = resolved.getTime() - started.getTime();
    }

    return this.prisma.incident.update({
      where: { id },
      data,
    });
  }

  async getIncidentMetrics() {
    const incidents = await this.prisma.incident.findMany();

    const monthlyStats: Record<
      string,
      {
        month: string;
        p1Count: number;
        p2Count: number;
        resolvedCount: number;
        totalResponseTimeMs: number;
        totalResolutionTimeMs: number;
        cSatScores: number[];
        repeatCount: number;
      }
    > = {};

    incidents.forEach((inc) => {
      const monthStr = inc.startedAt.toISOString().slice(0, 7); // e.g. "2026-06"
      if (!monthlyStats[monthStr]) {
        monthlyStats[monthStr] = {
          month: monthStr,
          p1Count: 0,
          p2Count: 0,
          resolvedCount: 0,
          totalResponseTimeMs: 0,
          totalResolutionTimeMs: 0,
          cSatScores: [],
          repeatCount: 0,
        };
      }

      const stat = monthlyStats[monthStr];
      if (inc.severity === 'P1') stat.p1Count++;
      if (inc.severity === 'P2') stat.p2Count++;
      if (inc.isRepeat) stat.repeatCount++;

      if (inc.status === IncidentStatus.RESOLVED) {
        stat.resolvedCount++;
        if (inc.responseTimeMs) stat.totalResponseTimeMs += inc.responseTimeMs;
        if (inc.resolutionTimeMs)
          stat.totalResolutionTimeMs += inc.resolutionTimeMs;
        if (inc.cSatScore) stat.cSatScores.push(inc.cSatScore);
      }
    });

    const metrics = Object.values(monthlyStats).map((stat) => {
      const avgResponseMins =
        stat.resolvedCount === 0
          ? 0
          : stat.totalResponseTimeMs / stat.resolvedCount / (1000 * 60);
      const avgResolutionMins =
        stat.resolvedCount === 0
          ? 0
          : stat.totalResolutionTimeMs / stat.resolvedCount / (1000 * 60);
      const avgCSat =
        stat.cSatScores.length === 0
          ? 0
          : stat.cSatScores.reduce((a, b) => a + b, 0) / stat.cSatScores.length;

      return {
        month: stat.month,
        p1Count: stat.p1Count,
        p2Count: stat.p2Count,
        resolvedCount: stat.resolvedCount,
        repeatCount: stat.repeatCount,
        avgResponseTimeMins: Math.round(avgResponseMins * 10) / 10,
        avgResolutionTimeMins: Math.round(avgResolutionMins * 10) / 10, // Mean Time to Resolution (MTTR)
        avgCSatScore: Math.round(avgCSat * 10) / 10,
        targets: {
          p1MttrTargetMet: avgResolutionMins <= 4 * 60, // P1 target: under 4 hours
          p2MttrTargetMet: avgResolutionMins <= 24 * 60, // P2 target: under 1 business day
          cSatTargetMet: avgCSat >= 90 || stat.cSatScores.length === 0, // CSAT target: 90%+
        },
      };
    });

    return metrics;
  }
}
