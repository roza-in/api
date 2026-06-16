import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../permissions/entitlements.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { DEFAULT_WORKING_HOURS } from './dto/working-hours.dto';
import { Prisma } from '../../generated/prisma';

@Injectable()
export class BranchService {
  private readonly logger = new Logger(BranchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  async create(businessId: string, userId: string, dto: CreateBranchDto) {
    await this.entitlementsService.assertBranchLimit(businessId);

    const branch = await this.prisma.branch.create({
      data: {
        businessId,
        name: dto.name,
        address: dto.address,
        phone: dto.phone,
        email: dto.email,
        timezone: dto.timezone || 'Asia/Kolkata',
        workingHours: (dto.workingHours ||
          DEFAULT_WORKING_HOURS) as unknown as Prisma.InputJsonValue,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    this.logger.log(
      `Branch "${branch.name}" (${branch.id}) created for business ${businessId}`,
    );

    return branch;
  }

  async findAll(businessId: string) {
    return this.prisma.branch.findMany({
      where: { businessId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(businessId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, businessId, deletedAt: null },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }

  async update(
    businessId: string,
    userId: string,
    branchId: string,
    dto: UpdateBranchDto,
  ) {
    const { version, workingHours, ...updateData } = dto;

    // Verify branch belongs to business before update
    const existing = await this.prisma.branch.findFirst({
      where: { id: branchId, businessId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Branch not found');
    }

    const result = await this.prisma.branch.updateMany({
      where: { id: branchId, businessId, version },
      data: {
        ...updateData,
        // Store workingHours as JSON — Prisma handles serialization
        ...(workingHours
          ? { workingHours: workingHours as unknown as Prisma.InputJsonValue }
          : {}),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new ConflictException(
        'Record was modified by another user. Please refresh and try again.',
      );
    }

    return this.prisma.branch.findFirstOrThrow({
      where: { id: branchId, businessId },
    });
  }

  async softDelete(businessId: string, userId: string, branchId: string) {
    // Verify branch belongs to business
    const existing = await this.prisma.branch.findFirst({
      where: { id: branchId, businessId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Branch not found');
    }

    // Prevent deleting the last branch
    const branchCount = await this.prisma.branch.count({
      where: { businessId, deletedAt: null },
    });

    if (branchCount <= 1) {
      throw new ConflictException(
        'Cannot delete the last branch of a business',
      );
    }

    await this.prisma.branch.update({
      where: { id: branchId },
      data: {
        deletedAt: new Date(),
        updatedBy: userId,
      },
    });

    this.logger.log(
      `Branch ${branchId} soft-deleted from business ${businessId} by user ${userId}`,
    );

    return { message: 'Branch deleted successfully' };
  }
}
