import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_ROLE_IDS } from '../../common/constants/roles.constants';

const PERMISSION_CACHE_PREFIX = 'auth:role:';
const PERMISSION_CACHE_SUFFIX = ':permissions';
const CACHE_TTL_SECONDS = 3600; // 1 hour

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const redisUrl =
      this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
  }

  /**
   * Resolves all permissions associated with a given role.
   * Leverages Redis cache, falling back to the database and populating the cache on miss.
   */
  async getPermissionsForRole(roleId: string): Promise<string[]> {
    const cacheKey = `${PERMISSION_CACHE_PREFIX}${roleId}${PERMISSION_CACHE_SUFFIX}`;

    try {
      // 1. Try to read from cache
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as string[];
      }
    } catch (error) {
      // Log error but fallback to database, do not crash the request
      const errorMessage = error instanceof Error ? error.stack : String(error);
      this.logger.error(
        `Failed to read permissions from Redis cache for role: ${roleId}`,
        errorMessage,
      );
    }

    // 2. Cache miss: read from database
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      this.logger.warn(`Role with ID ${roleId} not found in database`);
      return [];
    }

    const permissionNames = role.permissions.map((rp) => rp.permission.name);

    // 3. Write back to Redis cache asynchronously
    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(permissionNames),
        'EX',
        CACHE_TTL_SECONDS,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.stack : String(error);
      this.logger.error(
        `Failed to write permissions to Redis cache for role: ${roleId}`,
        errorMessage,
      );
    }

    return permissionNames;
  }

  /**
   * Invalidates the cached permissions for a specific role.
   */
  async invalidatePermissionsCache(roleId: string): Promise<void> {
    const cacheKey = `${PERMISSION_CACHE_PREFIX}${roleId}${PERMISSION_CACHE_SUFFIX}`;
    try {
      await this.redis.del(cacheKey);
      this.logger.log(`Invalidated permissions cache for role: ${roleId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.stack : String(error);
      this.logger.error(
        `Failed to invalidate permissions cache for role: ${roleId}`,
        errorMessage,
      );
    }
  }

  /**
   * Validates if the given role possesses the specified permission.
   */
  async hasPermission(
    roleId: string,
    requiredPermission: string,
  ): Promise<boolean> {
    const permissions = await this.getPermissionsForRole(roleId);
    return permissions.includes(requiredPermission);
  }

  /**
   * Resolves the name of the role by its ID, checking system roles first.
   */
  async getRoleName(roleId: string): Promise<string | null> {
    // Check system roles (fast path)
    const systemRoleEntry = Object.entries(SYSTEM_ROLE_IDS).find(
      ([, id]) => id === roleId,
    );
    if (systemRoleEntry) {
      return systemRoleEntry[0]; // e.g. 'OWNER'
    }

    // Custom roles fallback with caching
    const cacheKey = `${PERMISSION_CACHE_PREFIX}${roleId}:name`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.stack : String(error);
      this.logger.error(
        `Failed to read role name from cache: ${roleId}`,
        errorMessage,
      );
    }

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { name: true },
    });

    if (!role) {
      this.logger.warn(`Role with ID ${roleId} not found in database`);
      return null;
    }

    try {
      await this.redis.set(cacheKey, role.name, 'EX', CACHE_TTL_SECONDS);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.stack : String(error);
      this.logger.error(`Failed to cache role name: ${roleId}`, errorMessage);
    }

    return role.name;
  }
}
