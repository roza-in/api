import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerSearchDto } from './dto/customer-search.dto';
import type { Prisma } from '../../generated/prisma';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new customer profile, verifying phone uniqueness within the business.
   */
  async createCustomer(
    businessId: string,
    userId: string,
    dto: CreateCustomerDto,
  ) {
    // 1. Verify phone uniqueness in this business
    const existing = await this.prisma.customer.findFirst({
      where: { businessId, phone: dto.phone, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(
        'A customer with this phone number already exists in your business',
      );
    }

    return this.prisma.customer.create({
      data: {
        businessId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        gender: dto.gender,
        birthday: dto.birthday ? new Date(dto.birthday) : null,
        notes: dto.notes,
        totalSpent: 0,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  /**
   * List paginated customer profiles for a business, with optional search filter.
   */
  async findAll(businessId: string, searchDto: CustomerSearchDto) {
    const { page = 1, limit = 10, search } = searchDto;

    const where: Prisma.CustomerWhereInput = {
      businessId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieve a specific active customer profile by ID, along with their appointment visit history.
   */
  async findOne(businessId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, businessId, deletedAt: null },
      include: {
        appointments: {
          where: { deletedAt: null },
          include: { service: true, staff: true },
          orderBy: { startTime: 'desc' },
        },
        dataDeletionRequests: {
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    return customer;
  }

  /**
   * Update customer profile with phone uniqueness and version verification.
   */
  async updateCustomer(
    businessId: string,
    userId: string,
    id: string,
    dto: UpdateCustomerDto,
  ) {
    const existing = await this.prisma.customer.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Customer profile not found');
    }

    // If phone number is changing, verify uniqueness
    if (dto.phone && dto.phone !== existing.phone) {
      const isDuplicate = await this.prisma.customer.findFirst({
        where: { businessId, phone: dto.phone, deletedAt: null },
      });
      if (isDuplicate) {
        throw new ConflictException(
          'A customer with this phone number already exists in your business',
        );
      }
    }

    const { version, ...updateData } = dto;

    const result = await this.prisma.customer.updateMany({
      where: { id, businessId, version, deletedAt: null },
      data: {
        ...updateData,
        birthday: updateData.birthday
          ? new Date(updateData.birthday)
          : undefined,
        updatedBy: userId,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new ConflictException(
        'Record was modified by another user. Please refresh and try again.',
      );
    }

    return this.prisma.customer.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Soft delete a customer profile and anonymize PII (DPDP Act compliance).
   */
  async softDeleteCustomer(businessId: string, userId: string, id: string) {
    const existing = await this.prisma.customer.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Customer profile not found');
    }

    // Anonymize personal details while keeping analytics intact
    await this.prisma.customer.update({
      where: { id },
      data: {
        name: 'Anonymized Customer',
        phone: `anonymized-${id.substring(0, 8)}`,
        email: null,
        gender: null,
        birthday: null,
        notes: null,
        deletedAt: new Date(),
        updatedBy: userId,
      },
    });

    return { message: 'Customer profile deleted and anonymized successfully' };
  }

  /**
   * Recalculates the static totalSpent column by aggregating all captured payments from non-cancelled appointments.
   */
  async recalculateTotalSpent(businessId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }

    const aggregate = await this.prisma.payment.aggregate({
      where: {
        businessId,
        status: 'SUCCESS',
        appointment: {
          customerId,
          status: { in: ['CONFIRMED', 'COMPLETED', 'RESCHEDULED'] },
        },
      },
      _sum: { amount: true },
    });

    const total = aggregate._sum.amount ?? 0;

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { totalSpent: total },
    });

    return { totalSpent: total };
  }
}
