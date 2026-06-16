import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../../common/utils/encryption.service';
import { PaymentAdapterFactory } from './payment-adapter.factory';
import { SaveConfigDto } from './dto/save-config.dto';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { PaymentStatus, Prisma, Refund } from '../../generated/prisma';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly adapterFactory: PaymentAdapterFactory,
  ) {}

  async saveConfig(businessId: string, dto: SaveConfigDto): Promise<void> {
    const encryptedKeySecret = this.encryptionService.encrypt(dto.keySecret);
    const encryptedWebhookSecret = this.encryptionService.encrypt(
      dto.webhookSecret,
    );

    const configPayload = {
      keyId: dto.keyId,
      keySecret: encryptedKeySecret,
      webhookSecret: encryptedWebhookSecret,
    };

    await this.prisma.paymentConfig.upsert({
      where: {
        businessId_provider: {
          businessId,
          provider: dto.provider,
        },
      },
      create: {
        businessId,
        provider: dto.provider,
        config: configPayload,
        isActive: dto.isActive ?? true,
      },
      update: {
        config: configPayload,
        isActive: dto.isActive ?? true,
      },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        businessId,
        userId: businessId, // System level action, fallback to businessId context
        action: 'UPDATE',
        entity: 'PaymentConfig',
        entityId: businessId,
        metadata: { provider: dto.provider, isActive: dto.isActive ?? true },
      },
    });
  }

  async initializePayment(
    businessId: string,
    userId: string,
    dto: InitializePaymentDto,
  ): Promise<{ paymentId: string; paymentLinkUrl: string }> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: dto.appointmentId, businessId, deletedAt: null },
      include: {
        service: true,
        customer: true,
        branch: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // Check if there is already a SUCCESS payment for this appointment
    const existingPayment = await this.prisma.payment.findFirst({
      where: { appointmentId: appointment.id, status: PaymentStatus.SUCCESS },
    });

    if (existingPayment) {
      throw new BadRequestException('Appointment is already paid');
    }

    // 1. Create local pending Payment record
    const payment = await this.prisma.payment.create({
      data: {
        businessId,
        appointmentId: appointment.id,
        amount: appointment.service.price,
        status: PaymentStatus.PENDING,
        provider: 'razorpay',
      },
    });

    // 2. Fetch the adapter
    const adapter = await this.adapterFactory.getAdapter(
      businessId,
      'razorpay',
    );

    // 3. Request provider payment link
    try {
      const linkResult = await adapter.createPaymentLink({
        amount: Number(payment.amount),
        currency: 'INR',
        description: `Booking for ${appointment.service.name} at ${appointment.branch.name}`,
        customerName: appointment.customer.name,
        customerPhone: appointment.customer.phone,
        customerEmail: appointment.customer.email || undefined,
        notes: {
          businessId,
          paymentId: payment.id,
          appointmentId: appointment.id,
        },
      });

      // 4. Update payment record with provider link ID
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: linkResult.providerPaymentLinkId,
        },
      });

      // Log audit
      await this.prisma.auditLog.create({
        data: {
          businessId,
          userId,
          action: 'CREATE',
          entity: 'Payment',
          entityId: payment.id,
          metadata: {
            appointmentId: appointment.id,
            amount: payment.amount,
            providerPaymentId: linkResult.providerPaymentLinkId,
          },
        },
      });

      return {
        paymentId: payment.id,
        paymentLinkUrl: linkResult.paymentLinkUrl,
      };
    } catch (error) {
      // Mark local payment as FAILED
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });

      throw new BadRequestException(
        `Failed to initialize payment gateway link: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  async refundPayment(
    businessId: string,
    userId: string,
    paymentId: string,
    dto: RefundPaymentDto,
  ): Promise<Refund> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, businessId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== PaymentStatus.SUCCESS) {
      throw new BadRequestException('Only successful payments can be refunded');
    }

    const refundAmount = new Prisma.Decimal(
      Number(dto.amount ? dto.amount : payment.amount),
    );
    const paymentAmount = new Prisma.Decimal(Number(payment.amount));

    if (refundAmount.gt(paymentAmount)) {
      throw new BadRequestException(
        'Refund amount cannot exceed payment amount',
      );
    }

    // Call adapter
    const adapter = await this.adapterFactory.getAdapter(
      businessId,
      payment.provider,
    );

    if (!payment.providerPaymentId) {
      throw new BadRequestException(
        'Cannot refund a payment without a provider payment ID reference',
      );
    }

    try {
      const refundResult = await adapter.refundPayment({
        providerPaymentId: payment.providerPaymentId,
        amount: Number(refundAmount),
        notes: {
          businessId,
          paymentId: payment.id,
        },
      });

      // Create refund record
      const refund = await this.prisma.refund.create({
        data: {
          businessId,
          paymentId: payment.id,
          amount: refundAmount,
          status: refundResult.status,
          providerRefundId: refundResult.providerRefundId,
        },
      });

      // Update payment refund status
      const isFullRefund = refundAmount.equals(paymentAmount);
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: isFullRefund ? PaymentStatus.REFUNDED : payment.status,
          refundStatus: isFullRefund ? 'full' : 'partial',
        },
      });

      // Log audit
      await this.prisma.auditLog.create({
        data: {
          businessId,
          userId,
          action: 'CREATE',
          entity: 'Refund',
          entityId: refund.id,
          metadata: {
            paymentId: payment.id,
            amount: refundAmount,
            status: refund.status,
          },
        },
      });

      return refund;
    } catch (error) {
      throw new BadRequestException(
        `Failed to process refund through gateway: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
