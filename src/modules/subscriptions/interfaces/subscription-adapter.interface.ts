export interface CreateSubscriptionParams {
  planSlug: string;
  billingCycle: 'monthly' | 'yearly';
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes?: Record<string, string>;
}

export interface CreateSubscriptionResult {
  providerSubscriptionId: string;
  checkoutUrl: string;
}

export interface SaasSubscriptionAdapter {
  createSubscription(
    params: CreateSubscriptionParams,
  ): Promise<CreateSubscriptionResult>;
  cancelSubscription(
    providerSubscriptionId: string,
    atPeriodEnd: boolean,
  ): Promise<void>;
  updateSubscription(
    providerSubscriptionId: string,
    planSlug: string,
    billingCycle: 'monthly' | 'yearly',
  ): Promise<void>;
}
