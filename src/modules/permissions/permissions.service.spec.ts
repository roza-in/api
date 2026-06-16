const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { SYSTEM_ROLE_IDS } from '../../common/constants/roles.constants';

describe('PermissionsService', () => {
  let service: PermissionsService;

  const mockPrisma = {
    role: {
      findUnique: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('redis://localhost:6379'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);

    jest.clearAllMocks();
  });

  describe('getPermissionsForRole', () => {
    const roleId = 'custom-role-uuid';

    it('should return permissions from Redis cache if hit', async () => {
      const mockPermissions = ['appointment:create', 'appointment:read'];
      mockRedis.get.mockResolvedValue(JSON.stringify(mockPermissions));

      const result = await service.getPermissionsForRole(roleId);

      expect(result).toEqual(mockPermissions);
      expect(mockRedis.get).toHaveBeenCalledWith(
        `auth:role:${roleId}:permissions`,
      );
      expect(mockPrisma.role.findUnique).not.toHaveBeenCalled();
    });

    it('should fallback to Prisma and populate cache on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      const mockRoleDb = {
        id: roleId,
        name: 'CUSTOM_ROLE',
        permissions: [
          { permission: { name: 'appointment:create' } },
          { permission: { name: 'appointment:read' } },
        ],
      };
      mockPrisma.role.findUnique.mockResolvedValue(mockRoleDb);

      const result = await service.getPermissionsForRole(roleId);

      expect(result).toEqual(['appointment:create', 'appointment:read']);
      expect(mockPrisma.role.findUnique).toHaveBeenCalledWith({
        where: { id: roleId },
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      });
      expect(mockRedis.set).toHaveBeenCalledWith(
        `auth:role:${roleId}:permissions`,
        JSON.stringify(['appointment:create', 'appointment:read']),
        'EX',
        3600,
      );
    });

    it('should return empty array and log if role not found in database', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue(null);

      const result = await service.getPermissionsForRole(roleId);

      expect(result).toEqual([]);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should query DB successfully if Redis get throws an error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));
      const mockRoleDb = {
        id: roleId,
        permissions: [{ permission: { name: 'appointment:create' } }],
      };
      mockPrisma.role.findUnique.mockResolvedValue(mockRoleDb);

      const result = await service.getPermissionsForRole(roleId);

      expect(result).toEqual(['appointment:create']);
      expect(mockPrisma.role.findUnique).toHaveBeenCalled();
    });
  });

  describe('invalidatePermissionsCache', () => {
    it('should delete key from Redis', async () => {
      const roleId = 'role-to-invalidate';
      mockRedis.del.mockResolvedValue(1);

      await service.invalidatePermissionsCache(roleId);

      expect(mockRedis.del).toHaveBeenCalledWith(
        `auth:role:${roleId}:permissions`,
      );
    });
  });

  describe('hasPermission', () => {
    it('should return true if permissions list contains target', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify(['appointment:create', 'appointment:read']),
      );
      const result = await service.hasPermission(
        'role-id',
        'appointment:create',
      );
      expect(result).toBe(true);
    });

    it('should return false if permissions list does not contain target', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(['appointment:read']));
      const result = await service.hasPermission(
        'role-id',
        'appointment:create',
      );
      expect(result).toBe(false);
    });
  });

  describe('getRoleName', () => {
    it('should return role name directly for system role ID without DB/cache access', async () => {
      const result = await service.getRoleName(SYSTEM_ROLE_IDS.OWNER);

      expect(result).toBe('OWNER');
      expect(mockRedis.get).not.toHaveBeenCalled();
      expect(mockPrisma.role.findUnique).not.toHaveBeenCalled();
    });

    it('should fetch from Redis cache for custom role ID if hit', async () => {
      const customRoleId = 'custom-role-id';
      mockRedis.get.mockResolvedValue('CUSTOM_ROLE_NAME');

      const result = await service.getRoleName(customRoleId);

      expect(result).toBe('CUSTOM_ROLE_NAME');
      expect(mockRedis.get).toHaveBeenCalledWith(
        `auth:role:${customRoleId}:name`,
      );
      expect(mockPrisma.role.findUnique).not.toHaveBeenCalled();
    });

    it('should fallback to DB and populate cache on cache miss for custom role ID', async () => {
      const customRoleId = 'custom-role-id';
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue({
        name: 'CUSTOM_ROLE_NAME',
      });

      const result = await service.getRoleName(customRoleId);

      expect(result).toBe('CUSTOM_ROLE_NAME');
      expect(mockPrisma.role.findUnique).toHaveBeenCalledWith({
        where: { id: customRoleId },
        select: { name: true },
      });
      expect(mockRedis.set).toHaveBeenCalledWith(
        `auth:role:${customRoleId}:name`,
        'CUSTOM_ROLE_NAME',
        'EX',
        3600,
      );
    });
  });
});
