import { SetMetadata } from '@nestjs/common';
import { SubscriptionFeatures } from '../../modules/permissions/entitlements.service';

export const REQUIRE_FEATURE_KEY = 'require_feature';
export const RequireFeature = (featureName: keyof SubscriptionFeatures) =>
  SetMetadata(REQUIRE_FEATURE_KEY, featureName);
