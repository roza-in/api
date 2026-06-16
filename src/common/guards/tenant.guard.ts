import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { UserPayload } from '../interfaces/user-payload.interface';
import { SYSTEM_ROLE_IDS } from '../constants/roles.constants';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: UserPayload;
      params?: Record<string, unknown>;
      query?: Record<string, unknown>;
      body?: Record<string, unknown>;
    }>();
    const user = request.user;

    if (!user) {
      // Delegate authentication concern to JwtAuthGuard (this guard expects JWT context is already established)
      return true;
    }

    // Platform Admins bypass tenant checks to allow administrative control
    if (user.roleId === SYSTEM_ROLE_IDS.ADMIN) {
      return true;
    }

    const userBusinessId = user.businessId;
    if (!userBusinessId) {
      throw new ForbiddenException('No active tenant context in session');
    }

    // Extract businessId parameters from route params, query string, or request body
    const paramBusinessId =
      typeof request.params?.businessId === 'string'
        ? request.params.businessId
        : undefined;
    const queryBusinessId =
      typeof request.query?.businessId === 'string'
        ? request.query.businessId
        : undefined;
    const bodyBusinessId =
      typeof request.body?.businessId === 'string'
        ? request.body.businessId
        : undefined;

    // Verify all targets match the authenticated user's tenant context
    if (paramBusinessId && paramBusinessId !== userBusinessId) {
      throw new ForbiddenException('Tenant isolation violation');
    }

    if (queryBusinessId && queryBusinessId !== userBusinessId) {
      throw new ForbiddenException('Tenant isolation violation');
    }

    if (bodyBusinessId && bodyBusinessId !== userBusinessId) {
      throw new ForbiddenException('Tenant isolation violation');
    }

    return true;
  }
}
