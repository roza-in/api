import {
  PaymentAdapter,
  CreatePaymentLinkParams,
  PaymentLinkResult,
  RefundParams,
  RefundResult,
} from '../interfaces/payment-adapter.interface';
import { RefundStatus } from '../../../generated/prisma';
import Razorpay from 'razorpay';
import { validateWebhookSignature } from 'razorpay/dist/utils/razorpay-utils';

export class RazorpayAdapter implements PaymentAdapter {
  private readonly razorpay: Razorpay;

  constructor(keyId: string, keySecret: string) {
    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  async createPaymentLink(
    params: CreatePaymentLinkParams,
  ): Promise<PaymentLinkResult> {
    const amountInPaise = Math.round(params.amount * 100);

    const response = await this.razorpay.paymentLink.create({
      amount: amountInPaise,
      currency: params.currency || 'INR',
      description: params.description,
      customer: {
        name: params.customerName,
        contact: params.customerPhone,
        email: params.customerEmail || undefined,
      },
      notify: { sms: false, email: false }, // Handled by our own notification system
      notes: params.notes || {},
    });

    return {
      providerPaymentLinkId: response.id,
      paymentLinkUrl: response.short_url,
    };
  }

  verifyWebhookSignature(
    rawBody: string,
    signature: string,
    secret: string,
  ): boolean {
    try {
      return validateWebhookSignature(rawBody, signature, secret);
    } catch {
      return false;
    }
  }

  async refundPayment(params: RefundParams): Promise<RefundResult> {
    const amountInPaise = Math.round(params.amount * 100);

    const response = await this.razorpay.payments.refund(
      params.providerPaymentId,
      {
        amount: amountInPaise,
        notes: params.notes || {},
      },
    );

    return {
      providerRefundId: response.id,
      status:
        response.status === 'processed'
          ? RefundStatus.PROCESSED
          : RefundStatus.PENDING,
    };
  }
}
