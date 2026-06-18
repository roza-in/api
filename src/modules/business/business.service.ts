import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { DEFAULT_WORKING_HOURS } from './dto/working-hours.dto';
import { Prisma } from '../../generated/prisma';

const OWNER_ROLE_ID = '00000000-0000-0000-0000-000000000001';
const FREE_TRIAL_SLUG = 'free-trial';
const TRIAL_DURATION_DAYS = 90;

@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async registerBusiness(
    userId: string,
    email: string,
    dto: CreateBusinessDto,
  ) {
    // Option B: Enforce strict single-business membership limit
    const existingMembership = await this.prisma.businessMember.findFirst({
      where: { userId, deletedAt: null },
    });
    if (existingMembership) {
      throw new BadRequestException('User is already a member of a business');
    }

    let slug: string;
    if (dto.slug) {
      const isAvailable = await this.isSlugAvailable(dto.slug);
      if (!isAvailable) {
        throw new ConflictException('Slug is already taken');
      }
      slug = this.slugify(dto.slug);
    } else {
      slug = await this.generateUniqueSlug(dto.name);
    }

    // Find the free trial plan
    const trialPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { slug: FREE_TRIAL_SLUG },
    });

    if (!trialPlan) {
      throw new BadRequestException(
        'Trial plan not found — please seed the database first',
      );
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS);

    const now = new Date();

    // Atomic transaction: Business + Branch + Member + Subscription
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Business
      const business = await tx.business.create({
        data: {
          name: dto.name,
          slug,
          phone: dto.phone,
          email: dto.email,
          description: dto.description,
          planId: trialPlan.id,
          subscriptionStatus: 'TRIALING',
          trialEndsAt,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      // 2. Create default Branch
      const branch = await tx.branch.create({
        data: {
          businessId: business.id,
          name: dto.branch.name,
          address: dto.branch.address,
          phone: dto.branch.phone,
          email: dto.branch.email,
          timezone: dto.branch.timezone || 'Asia/Kolkata',
          workingHours: (dto.branch.workingHours ||
            DEFAULT_WORKING_HOURS) as unknown as Prisma.InputJsonValue,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      // 3. Create BusinessMember (Owner)
      const member = await tx.businessMember.create({
        data: {
          userId,
          businessId: business.id,
          roleId: OWNER_ROLE_ID,
        },
      });

      // 4. Create trial Subscription
      const subscription = await tx.subscription.create({
        data: {
          businessId: business.id,
          planId: trialPlan.id,
          status: 'TRIALING',
          currentPeriodStart: now,
          currentPeriodEnd: trialEndsAt,
        },
      });

      return { business, branch, member, subscription };
    });

    this.logger.log(
      `Business "${result.business.name}" (${result.business.id}) registered by user ${userId}`,
    );

    // 5. Generate fresh JWT with business context
    const tokens = this.authService.generateTokenPair(
      userId,
      email,
      result.business.id,
      result.member.id,
      OWNER_ROLE_ID,
    );

    return {
      business: result.business,
      branch: result.branch,
      subscription: result.subscription,
      ...tokens,
    };
  }

  async findCurrent(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: {
        branches: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: {
            members: { where: { deletedAt: null } },
            staff: { where: { deletedAt: null } },
            services: { where: { deletedAt: null } },
            customers: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    return business;
  }

  async update(businessId: string, userId: string, dto: UpdateBusinessDto) {
    const { version, ...updateData } = dto;

    const result = await this.prisma.business.updateMany({
      where: { id: businessId, version },
      data: {
        ...updateData,
        updatedBy: userId,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new ConflictException(
        'Record was modified by another user. Please refresh and try again.',
      );
    }

    return this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
  }

  async softDelete(businessId: string, userId: string) {
    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        deletedAt: new Date(),
        updatedBy: userId,
      },
    });

    this.logger.log(`Business ${businessId} soft-deleted by user ${userId}`);

    return { message: 'Business deleted successfully' };
  }

  async isSlugAvailable(slug: string): Promise<boolean> {
    const formatted = this.slugify(slug);
    if (formatted.length < 3) {
      return false;
    }
    const existing = await this.prisma.business.findUnique({
      where: { slug: formatted },
    });
    return !existing;
  }

  private async generateUniqueSlug(input: string): Promise<string> {
    const base = this.slugify(input);

    if (base.length < 3) {
      throw new BadRequestException(
        'Business name is too short to generate a valid slug',
      );
    }

    // Check if base slug is available
    const existing = await this.prisma.business.findUnique({
      where: { slug: base },
    });

    if (!existing) {
      return base;
    }

    // Collision — find next available suffix
    for (let suffix = 2; suffix <= 100; suffix++) {
      const candidate = `${base}-${suffix}`;
      const taken = await this.prisma.business.findUnique({
        where: { slug: candidate },
      });
      if (!taken) {
        return candidate;
      }
    }

    throw new ConflictException(
      'Unable to generate unique slug — too many businesses with similar names',
    );
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // remove non-word chars except spaces and hyphens
      .replace(/[\s_]+/g, '-') // replace spaces and underscores with hyphens
      .replace(/-+/g, '-') // collapse multiple hyphens
      .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
  }
}
