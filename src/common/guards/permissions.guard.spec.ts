import { PermissionsGuard } from './permissions.guard';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from '../../modules/permissions/permissions.service';
import { SYSTEM_ROLE_IDS } from '../constants/roles.constants';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;
  let permissionsService: PermissionsService;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  const mockPermissionsService = {
    getPermissionsForRole: jest.fn(),
  };

  beforeEach(() => {
    reflector = mockReflector as unknown as Reflector;
    permissionsService =
      mockPermissionsService as unknown as PermissionsService;
    guard = new PermissionsGuard(reflector, permissionsService);

    jest.clearAllMocks();
  });

  const createMockContext = (requestData: unknown): ExecutionContext => {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: <T>() => requestData as T,
      }),
    } as unknown as ExecutionContext;
  };

  it('should return true if no permissions metadata is defined', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(null);
    const context = createMockContext({});

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException if user is not present', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['appointment:create']);
    const context = createMockContext({ user: null });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw ForbiddenException if user has no roleId', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['appointment:create']);
    const context = createMockContext({ user: { roleId: null } });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should return true if user is platform admin (bypass standard checks)', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['appointment:create']);
    const context = createMockContext({
      user: { roleId: SYSTEM_ROLE_IDS.ADMIN },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockPermissionsService.getPermissionsForRole).not.toHaveBeenCalled();
  });

  it('should return true if user role possesses all required permissions', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([
      'appointment:create',
      'appointment:read',
    ]);
    mockPermissionsService.getPermissionsForRole.mockResolvedValue([
      'appointment:create',
      'appointment:read',
      'payment:read',
    ]);
    const context = createMockContext({ user: { roleId: 'role-uuid' } });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockPermissionsService.getPermissionsForRole).toHaveBeenCalledWith(
      'role-uuid',
    );
  });

  it('should throw ForbiddenException if user role is missing any required permission', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([
      'appointment:create',
      'appointment:delete',
    ]);
    mockPermissionsService.getPermissionsForRole.mockResolvedValue([
      'appointment:create',
    ]);
    const context = createMockContext({ user: { roleId: 'role-uuid' } });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
