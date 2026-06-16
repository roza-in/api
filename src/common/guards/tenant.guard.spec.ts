import { TenantGuard } from './tenant.guard';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SYSTEM_ROLE_IDS } from '../constants/roles.constants';

describe('TenantGuard', () => {
  let guard: TenantGuard;

  beforeEach(() => {
    guard = new TenantGuard();
  });

  const createMockContext = (requestData: unknown): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: <T>() => requestData as T,
      }),
    } as unknown as ExecutionContext;
  };

  it('should return true if no user payload exists (delegates authentication)', () => {
    const context = createMockContext({ user: null });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should return true if user is platform admin', () => {
    const context = createMockContext({
      user: { roleId: SYSTEM_ROLE_IDS.ADMIN },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if user has no businessId context', () => {
    const context = createMockContext({
      user: { roleId: 'some-role', businessId: null },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should return true if no target businessId parameters are present', () => {
    const context = createMockContext({
      user: { roleId: 'some-role', businessId: 'my-business' },
      params: {},
      query: {},
      body: {},
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if params.businessId does not match user businessId', () => {
    const context = createMockContext({
      user: { roleId: 'some-role', businessId: 'my-business' },
      params: { businessId: 'other-business' },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should return true if params.businessId matches user businessId', () => {
    const context = createMockContext({
      user: { roleId: 'some-role', businessId: 'my-business' },
      params: { businessId: 'my-business' },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if query.businessId does not match user businessId', () => {
    const context = createMockContext({
      user: { roleId: 'some-role', businessId: 'my-business' },
      query: { businessId: 'other-business' },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException if body.businessId does not match user businessId', () => {
    const context = createMockContext({
      user: { roleId: 'some-role', businessId: 'my-business' },
      body: { businessId: 'other-business' },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
