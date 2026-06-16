import { RefundStatus } from '../../../generated/prisma';

export interface CreatePaymentLinkParams {
  amount: number; // in standard rupees, e.g. 150.00
  currency: string;
  description: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  notes?: Record<string, string>;
}

export interface PaymentLinkResult {
  providerPaymentLinkId: string;
  paymentLinkUrl: string;
}

export interface RefundParams {
  providerPaymentId: string;
  amount: number; // in standard rupees
  notes?: Record<string, string>;
}

export interface RefundResult {
  providerRefundId: string;
  status: RefundStatus;
}

export interface PaymentAdapter {
  createPaymentLink(
    params: CreatePaymentLinkParams,
  ): Promise<PaymentLinkResult>;
  verifyWebhookSignature(
    rawBody: string,
    signature: string,
    secret: string,
  ): boolean;
  refundPayment(params: RefundParams): Promise<RefundResult>;
}
