import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Models that do NOT have a deletedAt column — skip soft delete filtering
const MODELS_WITHOUT_DELETED_AT = new Set([
  'AuditLog',
  'Payment',
  'Refund',
  'Invoice',
  'WebhookEvent',
  'Permission',
  'RolePermission',
  'StaffService',
  'SubscriptionPlan',
  'Subscription',
  'Notification',
  'Consent',
]);

function shouldApplySoftDelete(model: string): boolean {
  return !MODELS_WITHOUT_DELETED_AT.has(model);
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const isLocal =
      process.env.DATABASE_URL?.includes('localhost') ||
      process.env.DATABASE_URL?.includes('127.0.0.1') ||
      process.env.DATABASE_URL?.includes('@postgres:') ||
      process.env.DATABASE_URL?.includes('sslmode=disable') ||
      process.env.DB_SSL === 'false';

    if (!isLocal && process.env.NODE_ENV !== 'production') {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
    const adapter = new PrismaPg(pool);

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Returns a Prisma client extended with automatic soft-delete filtering.
   * Read operations (findMany, findFirst, count, aggregate, groupBy)
   * automatically append `{ deletedAt: null }` for models that support soft deletes.
   *
   * Usage: inject PrismaService, call `prisma.withSoftDelete()` for filtered reads,
   * or use PrismaService directly for unfiltered access.
   */
  withSoftDelete() {
    return this.$extends({
      query: {
        $allModels: {
          async findMany({ model, args, query }) {
            if (!shouldApplySoftDelete(model)) {
              return query(args);
            }
            if (args.where && 'deletedAt' in args.where) {
              return query(args);
            }
            args.where = { ...args.where, deletedAt: null };
            return query(args);
          },

          async findFirst({ model, args, query }) {
            if (!shouldApplySoftDelete(model)) {
              return query(args);
            }
            if (args.where && 'deletedAt' in args.where) {
              return query(args);
            }
            args.where = { ...args.where, deletedAt: null };
            return query(args);
          },

          async findFirstOrThrow({ model, args, query }) {
            if (!shouldApplySoftDelete(model)) {
              return query(args);
            }
            if (args.where && 'deletedAt' in args.where) {
              return query(args);
            }
            args.where = { ...args.where, deletedAt: null };
            return query(args);
          },

          async count({ model, args, query }) {
            if (!shouldApplySoftDelete(model)) {
              return query(args);
            }
            if (args.where && 'deletedAt' in args.where) {
              return query(args);
            }
            args.where = { ...args.where, deletedAt: null };
            return query(args);
          },

          async aggregate({ model, args, query }) {
            if (!shouldApplySoftDelete(model)) {
              return query(args);
            }
            if (args.where && 'deletedAt' in args.where) {
              return query(args);
            }
            args.where = { ...args.where, deletedAt: null };
            return query(args);
          },

          async groupBy({ model, args, query }) {
            if (!shouldApplySoftDelete(model)) {
              return query(args);
            }
            if (args.where && 'deletedAt' in args.where) {
              return query(args);
            }
            args.where = { ...args.where, deletedAt: null };
            return query(args);
          },
        },
      },
    });
  }
}
