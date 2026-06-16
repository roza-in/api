import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- Category Management ---

  async createCategory(
    businessId: string,
    userId: string,
    dto: CreateCategoryDto,
  ) {
    // Validate parent category if specified
    if (dto.parentCategoryId) {
      const parent = await this.prisma.serviceCategory.findFirst({
        where: { id: dto.parentCategoryId, businessId, deletedAt: null },
      });
      if (!parent) {
        throw new BadRequestException(
          'Parent category not found or belongs to another business',
        );
      }
    }

    const category = await this.prisma.serviceCategory.create({
      data: {
        businessId,
        name: dto.name,
        parentCategoryId: dto.parentCategoryId || null,
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    this.logger.log(
      `Service Category "${category.name}" (${category.id}) created for business ${businessId}`,
    );
    return category;
  }

  async findAllCategories(businessId: string) {
    return this.prisma.serviceCategory.findMany({
      where: { businessId, deletedAt: null },
      include: {
        subCategories: {
          where: { deletedAt: null },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOneCategory(businessId: string, categoryId: string) {
    const category = await this.prisma.serviceCategory.findFirst({
      where: { id: categoryId, businessId, deletedAt: null },
      include: {
        subCategories: {
          where: { deletedAt: null },
        },
        parentCategory: true,
      },
    });

    if (!category) {
      throw new NotFoundException('Service category not found');
    }
    return category;
  }

  async updateCategory(
    businessId: string,
    userId: string,
    categoryId: string,
    dto: UpdateCategoryDto,
  ) {
    // Verify category exists
    const existing = await this.prisma.serviceCategory.findFirst({
      where: { id: categoryId, businessId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Service category not found');
    }

    // Validate parent category if specified
    if (dto.parentCategoryId) {
      if (dto.parentCategoryId === categoryId) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      const parent = await this.prisma.serviceCategory.findFirst({
        where: { id: dto.parentCategoryId, businessId, deletedAt: null },
      });
      if (!parent) {
        throw new BadRequestException(
          'Parent category not found or belongs to another business',
        );
      }
    }

    const updated = await this.prisma.serviceCategory.update({
      where: { id: categoryId },
      data: {
        ...dto,
        updatedBy: userId,
      },
    });

    this.logger.log(`Service Category ${categoryId} updated by user ${userId}`);
    return updated;
  }

  async softDeleteCategory(
    businessId: string,
    userId: string,
    categoryId: string,
  ) {
    const existing = await this.prisma.serviceCategory.findFirst({
      where: { id: categoryId, businessId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Service category not found');
    }

    // Prevent deletion if active subcategories exist
    const subCount = await this.prisma.serviceCategory.count({
      where: { parentCategoryId: categoryId, businessId, deletedAt: null },
    });
    if (subCount > 0) {
      throw new ConflictException(
        'Cannot delete category with active subcategories',
      );
    }

    // Prevent deletion if active services exist
    const serviceCount = await this.prisma.service.count({
      where: { categoryId, businessId, deletedAt: null },
    });
    if (serviceCount > 0) {
      throw new ConflictException(
        'Cannot delete category containing active services',
      );
    }

    await this.prisma.serviceCategory.update({
      where: { id: categoryId },
      data: {
        deletedAt: new Date(),
        updatedBy: userId,
      },
    });

    this.logger.log(
      `Service Category ${categoryId} soft-deleted by user ${userId}`,
    );
    return { message: 'Service category deleted successfully' };
  }

  // --- Service Management ---

  async createService(
    businessId: string,
    userId: string,
    dto: CreateServiceDto,
  ) {
    const { staffIds, ...serviceData } = dto;

    // Validate category exists
    const category = await this.prisma.serviceCategory.findFirst({
      where: { id: dto.categoryId, businessId, deletedAt: null },
    });
    if (!category) {
      throw new BadRequestException(
        'Category not found or belongs to another business',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Create the Service
      const service = await tx.service.create({
        data: {
          ...serviceData,
          businessId,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      // 2. Validate and Link Staff Members
      if (staffIds && staffIds.length > 0) {
        const validStaffCount = await tx.staff.count({
          where: {
            id: { in: staffIds },
            businessId,
            deletedAt: null,
          },
        });

        if (validStaffCount !== staffIds.length) {
          throw new BadRequestException(
            'One or more staff IDs are invalid or belong to another business',
          );
        }

        const staffLinkData = staffIds.map((staffId) => ({
          serviceId: service.id,
          staffId,
        }));

        await tx.staffService.createMany({
          data: staffLinkData,
        });
      }

      this.logger.log(
        `Service "${service.name}" (${service.id}) created by user ${userId}`,
      );
      return tx.service.findUniqueOrThrow({
        where: { id: service.id },
        include: {
          staff: {
            select: {
              staffId: true,
            },
          },
        },
      });
    });
  }

  async findAllServices(businessId: string, filterCategoryId?: string) {
    return this.prisma.service.findMany({
      where: {
        businessId,
        deletedAt: null,
        ...(filterCategoryId ? { categoryId: filterCategoryId } : {}),
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        staff: {
          select: {
            staffId: true,
            staff: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOneService(businessId: string, serviceId: string) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, businessId, deletedAt: null },
      include: {
        category: true,
        staff: {
          include: {
            staff: true,
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }
    return service;
  }

  async updateService(
    businessId: string,
    userId: string,
    serviceId: string,
    dto: UpdateServiceDto,
  ) {
    const { version, staffIds, ...serviceData } = dto;

    // Verify service exists
    const existing = await this.prisma.service.findFirst({
      where: { id: serviceId, businessId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Service not found');
    }

    // Validate category if updating it
    if (dto.categoryId) {
      const category = await this.prisma.serviceCategory.findFirst({
        where: { id: dto.categoryId, businessId, deletedAt: null },
      });
      if (!category) {
        throw new BadRequestException(
          'Category not found or belongs to another business',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Update service details with optimistic locking
      const result = await tx.service.updateMany({
        where: { id: serviceId, businessId, version },
        data: {
          ...serviceData,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        throw new ConflictException(
          'Record was modified by another user. Please refresh and try again.',
        );
      }

      // 2. Sync Staff Assignments
      if (staffIds) {
        // Delete all old linkages
        await tx.staffService.deleteMany({
          where: { serviceId },
        });

        if (staffIds.length > 0) {
          const validStaffCount = await tx.staff.count({
            where: {
              id: { in: staffIds },
              businessId,
              deletedAt: null,
            },
          });

          if (validStaffCount !== staffIds.length) {
            throw new BadRequestException(
              'One or more staff IDs are invalid or belong to another business',
            );
          }

          const staffLinkData = staffIds.map((staffId) => ({
            serviceId,
            staffId,
          }));

          await tx.staffService.createMany({
            data: staffLinkData,
          });
        }
      }

      this.logger.log(`Service ${serviceId} updated by user ${userId}`);

      return tx.service.findUniqueOrThrow({
        where: { id: serviceId },
        include: {
          staff: {
            select: {
              staffId: true,
            },
          },
        },
      });
    });
  }

  async softDeleteService(
    businessId: string,
    userId: string,
    serviceId: string,
  ) {
    const existing = await this.prisma.service.findFirst({
      where: { id: serviceId, businessId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Service not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Hard delete staff associations
      await tx.staffService.deleteMany({
        where: { serviceId },
      });

      // 2. Soft delete the service record
      await tx.service.update({
        where: { id: serviceId },
        data: {
          deletedAt: new Date(),
          updatedBy: userId,
        },
      });

      this.logger.log(`Service ${serviceId} soft-deleted by user ${userId}`);
      return { message: 'Service deleted successfully' };
    });
  }
}
