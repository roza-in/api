import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from '../../modules/permissions/permissions.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { UserPayload } from '../interfaces/user-payload.interface';
import { SYSTEM_ROLE_IDS } from '../constants/roles.constants';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: UserPayload }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    if (!user.roleId) {
      throw new ForbiddenException('No role context in session');
    }

    // Platform Admins bypass standard business permission checks
    if (user.roleId === SYSTEM_ROLE_IDS.ADMIN) {
      return true;
    }

    const userPermissions = await this.permissionsService.getPermissionsForRole(
      user.roleId,
    );

    // Check if the user's role possesses all required permissions
    const hasAllPermissions = requiredPermissions.every((perm) =>
      userPermissions.includes(perm),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
