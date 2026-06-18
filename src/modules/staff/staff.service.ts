import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../permissions/entitlements.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { SYSTEM_ROLE_IDS } from '../../common/constants/roles.constants';
import type { Prisma } from '../../generated/prisma';

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementsService: EntitlementsService,
    @InjectQueue('notifications') private readonly notificationQueue: Queue,
  ) {}

  /**
   * Register a new staff member under a business branch, link services, and check subscription limits.
   */
  async createStaff(businessId: string, userId: string, dto: CreateStaffDto) {
    // 1. Assert staff limit
    await this.entitlementsService.assertStaffLimit(businessId);

    // 2. Verify branch belongs to the business
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, businessId, deletedAt: null },
    });
    if (!branch) {
      throw new BadRequestException(
        'Branch does not exist or does not belong to this business',
      );
    }

    // 3. Verify all serviceIds belong to this business
    if (dto.serviceIds && dto.serviceIds.length > 0) {
      const serviceCount = await this.prisma.service.count({
        where: {
          id: { in: dto.serviceIds },
          businessId,
          deletedAt: null,
        },
      });
      if (serviceCount !== dto.serviceIds.length) {
        throw new BadRequestException(
          'One or more services do not exist or belong to another business',
        );
      }
    }

    // Validate roleId if provided, default to PROFESSIONAL system role
    let targetRoleId: string = SYSTEM_ROLE_IDS.PROFESSIONAL;
    if (dto.roleId) {
      const role = await this.prisma.role.findFirst({
        where: {
          id: dto.roleId,
          OR: [
            { businessId },
            { isSystem: true },
          ],
        },
      });
      if (!role) {
        throw new BadRequestException('Role does not exist');
      }
      targetRoleId = dto.roleId;
    }

    // 4. Create staff record and map services atomically
    const staff = await this.prisma.$transaction(async (tx) => {
      const created = await tx.staff.create({
        data: {
          businessId,
          branchId: dto.branchId,
          roleId: targetRoleId,
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
          skills: dto.skills || [],
          salary: dto.salary ?? null,
          commission: dto.commission,
          workingHours: (dto.workingHours || {}) as Prisma.InputJsonValue,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      if (dto.serviceIds && dto.serviceIds.length > 0) {
        await tx.staffService.createMany({
          data: dto.serviceIds.map((serviceId) => ({
            staffId: created.id,
            serviceId,
          })),
        });
      }

      return created;
    });

    return this.prisma.staff.findUniqueOrThrow({
      where: { id: staff.id },
      include: { services: true },
    });
  }

  /**
   * Retrieves all active staff profiles for a business.
   */
  async findAll(businessId: string) {
    return this.prisma.staff.findMany({
      where: { businessId, deletedAt: null },
      include: { services: true, branch: true },
    });
  }

  /**
   * Retrieve a specific active staff profile by ID.
   */
  async findOne(businessId: string, id: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, businessId, deletedAt: null },
      include: {
        services: true,
        branch: true,
        leaves: { where: { deletedAt: null } },
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    return staff;
  }

  /**
   * Update staff profile, sync services, and perform optimistic locking check.
   */
  async updateStaff(
    businessId: string,
    userId: string,
    id: string,
    dto: UpdateStaffDto,
  ) {
    const existing = await this.prisma.staff.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Staff member not found');
    }

    // If changing branch, verify it belongs to business
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, businessId, deletedAt: null },
      });
      if (!branch) {
        throw new BadRequestException(
          'Branch does not exist or does not belong to this business',
        );
      }
    }

    // If changing serviceIds, verify they all belong to business
    if (dto.serviceIds && dto.serviceIds.length > 0) {
      const serviceCount = await this.prisma.service.count({
        where: {
          id: { in: dto.serviceIds },
          businessId,
          deletedAt: null,
        },
      });
      if (serviceCount !== dto.serviceIds.length) {
        throw new BadRequestException(
          'One or more services do not exist or belong to another business',
        );
      }
    }

    // If changing roleId, verify it exists
    if (dto.roleId) {
      const role = await this.prisma.role.findFirst({
        where: {
          id: dto.roleId,
          OR: [
            { businessId },
            { isSystem: true },
          ],
        },
      });
      if (!role) {
        throw new BadRequestException('Role does not exist');
      }
    }

    const { version, serviceIds, ...updateData } = dto;

    const updated = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.staff.updateMany({
        where: { id, businessId, version, deletedAt: null },
        data: {
          ...updateData,
          workingHours: updateData.workingHours
            ? (updateData.workingHours as Prisma.InputJsonValue)
            : undefined,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException(
          'Record was modified by another user. Please refresh and try again.',
        );
      }

      if (serviceIds !== undefined) {
        await tx.staffService.deleteMany({ where: { staffId: id } });
        if (serviceIds.length > 0) {
          await tx.staffService.createMany({
            data: serviceIds.map((serviceId) => ({
              staffId: id,
              serviceId,
            })),
          });
        }
      }

      return tx.staff.findUniqueOrThrow({
        where: { id },
        include: { services: true },
      });
    });

    return updated;
  }

  /**
   * Soft delete a staff member, clear service links, and unlink login credentials.
   */
  async softDeleteStaff(businessId: string, userId: string, id: string) {
    const existing = await this.prisma.staff.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Staff member not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // Clean up service links
      await tx.staffService.deleteMany({ where: { staffId: id } });

      // Soft delete staff profile and unlink business member
      await tx.staff.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          memberId: null,
          updatedBy: userId,
        },
      });
    });

    return { message: 'Staff member deleted successfully' };
  }

  /**
   * Invites a staff member: creates a User & BusinessMember if not exists, and queues an invite job.
   */
  async inviteStaff(businessId: string, userId: string, id: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    // 1. Find or create User by email
    let user = await this.prisma.user.findUnique({
      where: { email: staff.email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: staff.email,
          passwordHash: '', // Set dummy hash for pending user
          status: 'PENDING',
        },
      });
    }

    // 2. Find or create BusinessMember link with staff's pre-assigned roleId
    let member = await this.prisma.businessMember.findUnique({
      where: { userId: user.id },
    });

    if (member) {
      if (member.businessId !== businessId) {
        throw new BadRequestException('User is already a member of another business');
      }
    } else {
      member = await this.prisma.businessMember.create({
        data: {
          userId: user.id,
          businessId,
          roleId: staff.roleId,
        },
      });
    }

    // 3. Link BusinessMember to Staff profile
    await this.prisma.staff.update({
      where: { id },
      data: {
        memberId: member.id,
        updatedBy: userId,
      },
    });

    // 4. Queue the invite job
    await this.notificationQueue.add('staff-invite', {
      staffId: staff.id,
      businessId,
      email: staff.email,
      phone: staff.phone,
    });

    return { message: 'Staff invitation sent successfully' };
  }

  /**
   * Create a leave entry for a staff member, ensuring no overlaps.
   */
  async createLeave(
    businessId: string,
    userId: string,
    staffId: string,
    dto: CreateLeaveDto,
  ) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, businessId, deletedAt: null },
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);

    if (end <= start) {
      throw new BadRequestException('Leave end time must be after start time');
    }

    // Check for overlapping leaves (excluding soft deleted ones)
    const overlapping = await this.prisma.leave.findFirst({
      where: {
        staffId,
        deletedAt: null,
        OR: [
          {
            startTime: { lte: start },
            endTime: { gte: start },
          },
          {
            startTime: { lte: end },
            endTime: { gte: end },
          },
          {
            startTime: { gte: start },
            endTime: { lte: end },
          },
        ],
      },
    });

    if (overlapping) {
      throw new ConflictException(
        'Staff member is already on leave during this period',
      );
    }

    return this.prisma.leave.create({
      data: {
        businessId,
        staffId,
        startTime: start,
        endTime: end,
        reason: dto.reason,
      },
    });
  }

  /**
   * Soft delete leave from database.
   */
  async softDeleteLeave(businessId: string, _userId: string, leaveId: string) {
    const leave = await this.prisma.leave.findFirst({
      where: { id: leaveId, businessId, deletedAt: null },
    });
    if (!leave) {
      throw new NotFoundException('Leave entry not found');
    }

    await this.prisma.leave.update({
      where: { id: leaveId },
      data: { deletedAt: new Date() },
    });

    return { message: 'Leave deleted successfully' };
  }
}
