import { RolesGuard } from './roles.guard';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from '../../modules/permissions/permissions.service';
import { Role } from '../constants/roles.constants';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let permissionsService: PermissionsService;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  const mockPermissionsService = {
    getRoleName: jest.fn(),
  };

  beforeEach(() => {
    reflector = mockReflector as unknown as Reflector;
    permissionsService =
      mockPermissionsService as unknown as PermissionsService;
    guard = new RolesGuard(reflector, permissionsService);

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

  it('should return true if no roles metadata is defined', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(null);
    const context = createMockContext({});

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException if user is not present', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([Role.OWNER]);
    const context = createMockContext({ user: null });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw ForbiddenException if user has no roleId', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([Role.OWNER]);
    const context = createMockContext({ user: { roleId: null } });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should allow access if user resolved role matches required roles', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([Role.OWNER, Role.MANAGER]);
    mockPermissionsService.getRoleName.mockResolvedValue('MANAGER');
    const context = createMockContext({ user: { roleId: 'role-uuid' } });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockPermissionsService.getRoleName).toHaveBeenCalledWith(
      'role-uuid',
    );
  });

  it('should throw ForbiddenException if user resolved role does not match required roles', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([Role.OWNER]);
    mockPermissionsService.getRoleName.mockResolvedValue('PROFESSIONAL');
    const context = createMockContext({ user: { roleId: 'role-uuid' } });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
