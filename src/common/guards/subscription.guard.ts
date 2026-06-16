import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementsService } from '../../modules/permissions/entitlements.service';
import { REQUIRE_FEATURE_KEY } from '../decorators/require-feature.decorator';
import { UserPayload } from '../interfaces/user-payload.interface';
import { SYSTEM_ROLE_IDS } from '../constants/roles.constants';

import { SubscriptionFeatures } from '../../modules/permissions/entitlements.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private entitlementsService: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<
      keyof SubscriptionFeatures
    >(REQUIRE_FEATURE_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: UserPayload }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Platform Admins bypass subscription feature gates
    if (user.roleId === SYSTEM_ROLE_IDS.ADMIN) {
      return true;
    }

    if (!user.businessId) {
      throw new ForbiddenException('No business context in session');
    }

    const hasFeature = await this.entitlementsService.hasFeature(
      user.businessId,
      requiredFeature,
    );

    if (!hasFeature) {
      throw new ForbiddenException(
        `Feature '${requiredFeature}' is not enabled in your current subscription plan. Please upgrade.`,
      );
    }

    return true;
  }
}
