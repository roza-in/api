import {
  SaasSubscriptionAdapter,
  CreateSubscriptionParams,
  CreateSubscriptionResult,
} from '../interfaces/subscription-adapter.interface';
import Razorpay from 'razorpay';
import { ConfigService } from '@nestjs/config';

export class RazorpaySubscriptionAdapter implements SaasSubscriptionAdapter {
  private readonly razorpay: Razorpay;

  constructor(
    private readonly configService: ConfigService,
    keyId: string,
    keySecret: string,
  ) {
    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  private getRazorpayPlanId(
    planSlug: string,
    billingCycle: 'monthly' | 'yearly',
  ): string {
    const envKey = `RAZORPAY_PLAN_${planSlug.toUpperCase().replace(/-/g, '_')}_${billingCycle.toUpperCase()}`;
    return (
      this.configService.get<string>(envKey) ||
      `plan_${planSlug.replace(/-/g, '_')}_${billingCycle}_test`
    );
  }

  async createSubscription(
    params: CreateSubscriptionParams,
  ): Promise<CreateSubscriptionResult> {
    const rzpPlanId = this.getRazorpayPlanId(
      params.planSlug,
      params.billingCycle,
    );

    const subscription = await this.razorpay.subscriptions.create({
      plan_id: rzpPlanId,
      total_count: params.billingCycle === 'monthly' ? 60 : 5, // up to 5 years recurring
      customer_notify: true,
      notes: params.notes || {},
    });

    return {
      providerSubscriptionId: subscription.id,
      checkoutUrl: subscription.short_url,
    };
  }

  async cancelSubscription(
    providerSubscriptionId: string,
    atPeriodEnd: boolean,
  ): Promise<void> {
    await this.razorpay.subscriptions.cancel(
      providerSubscriptionId,
      atPeriodEnd ? 1 : 0,
    );
  }

  async updateSubscription(
    providerSubscriptionId: string,
    planSlug: string,
    billingCycle: 'monthly' | 'yearly',
  ): Promise<void> {
    const rzpPlanId = this.getRazorpayPlanId(planSlug, billingCycle);
    await this.razorpay.subscriptions.update(providerSubscriptionId, {
      plan_id: rzpPlanId,
      schedule_change_at: 'now',
    });
  }
}
