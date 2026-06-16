import { SubscriptionGuard } from './subscription.guard';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementsService } from '../../modules/permissions/entitlements.service';
import { SYSTEM_ROLE_IDS } from '../constants/roles.constants';

describe('SubscriptionGuard', () => {
  let guard: SubscriptionGuard;
  let reflector: Reflector;
  let entitlementsService: EntitlementsService;

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  const mockEntitlementsService = {
    hasFeature: jest.fn(),
  };

  beforeEach(() => {
    reflector = mockReflector as unknown as Reflector;
    entitlementsService =
      mockEntitlementsService as unknown as EntitlementsService;
    guard = new SubscriptionGuard(reflector, entitlementsService);

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

  it('should return true if no require feature metadata is defined', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(null);
    const context = createMockContext({});

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException if user is not present', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('customDomain');
    const context = createMockContext({ user: null });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should return true if user is platform admin (bypass subscription checks)', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('customDomain');
    const context = createMockContext({
      user: { roleId: SYSTEM_ROLE_IDS.ADMIN },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEntitlementsService.hasFeature).not.toHaveBeenCalled();
  });

  it('should throw ForbiddenException if user has no businessId', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('customDomain');
    const context = createMockContext({
      user: { roleId: 'some-role', businessId: null },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should allow access if feature is enabled for business', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('customDomain');
    mockEntitlementsService.hasFeature.mockResolvedValue(true);
    const context = createMockContext({
      user: { roleId: 'some-role', businessId: 'biz-uuid' },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockEntitlementsService.hasFeature).toHaveBeenCalledWith(
      'biz-uuid',
      'customDomain',
    );
  });

  it('should throw ForbiddenException if feature is disabled for business', async () => {
    mockReflector.getAllAndOverride.mockReturnValue('customDomain');
    mockEntitlementsService.hasFeature.mockResolvedValue(false);
    const context = createMockContext({
      user: { roleId: 'some-role', businessId: 'biz-uuid' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
