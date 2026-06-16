import {
  Controller,
  Post,
  Get,
  Req,
  Param,
  UnauthorizedException,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentAdapterFactory } from '../payments/payment-adapter.factory';
import { RazorpayAdapter } from '../payments/adapters/razorpay.adapter';
import { QUEUE_WEBHOOKS } from '../queue/queue.constants';
import { WebhookStatus, Prisma } from '../../generated/prisma';
import { WhatsAppStatusPayload, Msg91StatusItem } from './webhook.interfaces';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

interface RazorpayWebhookPayload {
  event_id?: string;
  id?: string;
  event: string;
  payload?: {
    subscription?: {
      entity?: {
        notes?: {
          businessId?: string;
          planId?: string;
          [key: string]: unknown;
        };
        [key: string]: unknown;
      };
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterFactory: PaymentAdapterFactory,
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_WEBHOOKS)
    private readonly webhookQueue: Queue,
  ) {}

  @Post('razorpay/:businessId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Handle incoming Razorpay webhooks for a specific business',
  })
  @ApiResponse({ status: 200, description: 'Webhook accepted and queued' })
  async handleRazorpay(
    @Param('businessId') businessId: string,
    @Req() req: RawBodyRequest,
  ): Promise<{ status: string }> {
    if (!req.rawBody) {
      throw new BadRequestException(
        'Missing raw body for webhook verification',
      );
    }

    const signature = req.headers['x-razorpay-signature'] as string;
    if (!signature) {
      throw new UnauthorizedException('Missing x-razorpay-signature header');
    }

    const rawBodyStr = req.rawBody.toString('utf-8');

    // 1. Resolve webhook secret
    const webhookSecret = await this.adapterFactory.getWebhookSecret(
      businessId,
      'razorpay',
    );

    // 2. Fetch the adapter
    const adapter = await this.adapterFactory.getAdapter(
      businessId,
      'razorpay',
    );

    // 3. Verify signature
    const isValid = adapter.verifyWebhookSignature(
      rawBodyStr,
      signature,
      webhookSecret,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // 4. Parse body and verify idempotency
    const body = JSON.parse(rawBodyStr) as RazorpayWebhookPayload;
    const eventId = body.event_id || body.id;

    if (!eventId) {
      throw new BadRequestException('Missing event ID in payload');
    }

    // Check if event was already processed
    const existingEvent = await this.prisma.webhookEvent.findUnique({
      where: { providerEventId: eventId },
    });

    if (existingEvent) {
      return { status: 'already_processed' };
    }

    // 5. Persist the WebhookEvent
    const webhookEvent = await this.prisma.webhookEvent.create({
      data: {
        provider: 'razorpay',
        eventType: body.event,
        providerEventId: eventId,
        payload: body as unknown as Prisma.InputJsonValue,
        status: WebhookStatus.PENDING,
      },
    });

    // 6. Queue job for async processing
    await this.webhookQueue.add(
      'process-razorpay',
      {
        eventId: webhookEvent.id,
        businessId,
      },
      {
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    );

    return { status: 'accepted' };
  }

  @Post('razorpay-platform')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Handle platform-wide Razorpay webhooks (subscriptions)',
  })
  @ApiResponse({ status: 200, description: 'Webhook accepted and queued' })
  async handleRazorpayPlatform(
    @Req() req: RawBodyRequest,
  ): Promise<{ status: string }> {
    if (!req.rawBody) {
      throw new BadRequestException(
        'Missing raw body for webhook verification',
      );
    }

    const signature = req.headers['x-razorpay-signature'] as string;
    if (!signature) {
      throw new UnauthorizedException('Missing x-razorpay-signature header');
    }

    const rawBodyStr = req.rawBody.toString('utf-8');
    const webhookSecret = this.configService.getOrThrow<string>(
      'RAZORPAY_WEBHOOK_SECRET',
    );

    // Verify signature using platform keys
    const keyId = this.configService.getOrThrow<string>('RAZORPAY_KEY_ID');
    const keySecret = this.configService.getOrThrow<string>(
      'RAZORPAY_KEY_SECRET',
    );
    const adapter = new RazorpayAdapter(keyId, keySecret);

    const isValid = adapter.verifyWebhookSignature(
      rawBodyStr,
      signature,
      webhookSecret,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid platform webhook signature');
    }

    const body = JSON.parse(rawBodyStr) as RazorpayWebhookPayload;
    const eventId = body.event_id || body.id;

    if (!eventId) {
      throw new BadRequestException('Missing event ID in payload');
    }

    const existingEvent = await this.prisma.webhookEvent.findUnique({
      where: { providerEventId: eventId },
    });

    if (existingEvent) {
      return { status: 'already_processed' };
    }

    // Extract businessId from payload notes
    const subscriptionEntity = body.payload?.subscription?.entity;
    const notes = subscriptionEntity?.notes || {};
    const businessId = notes.businessId;

    if (!businessId) {
      throw new BadRequestException('Missing business ID in webhook notes');
    }

    const webhookEvent = await this.prisma.webhookEvent.create({
      data: {
        provider: 'razorpay-platform',
        eventType: body.event,
        providerEventId: eventId,
        payload: body as unknown as Prisma.InputJsonValue,
        status: WebhookStatus.PENDING,
      },
    });

    await this.webhookQueue.add(
      'process-razorpay-platform',
      {
        eventId: webhookEvent.id,
        businessId,
      },
      {
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    );

    return { status: 'accepted' };
  }

  @Get('whatsapp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify WhatsApp Webhook' })
  verifyWhatsApp(@Req() req: Request) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken =
      this.configService.get<string>('hub.verify_token') ||
      this.configService.get<string>('WHATSAPP_VERIFY_TOKEN') ||
      'rozx-whatsapp-verify-token';

    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    throw new UnauthorizedException('Verification failed');
  }

  @Post('whatsapp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle WhatsApp status callbacks' })
  async handleWhatsAppStatus(
    @Req() req: RawBodyRequest,
  ): Promise<{ status: string }> {
    const body = req.body as WhatsAppStatusPayload;
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const statusObj = value?.statuses?.[0];

    if (!statusObj) {
      return { status: 'ignored' };
    }

    const providerEventId = `${statusObj.id}-${statusObj.status}`;

    const existingEvent = await this.prisma.webhookEvent.findUnique({
      where: { providerEventId },
    });

    if (existingEvent) {
      return { status: 'already_processed' };
    }

    const webhookEvent = await this.prisma.webhookEvent.create({
      data: {
        provider: 'whatsapp',
        eventType: 'status_update',
        providerEventId,
        payload: body as unknown as Prisma.InputJsonValue,
        status: WebhookStatus.PENDING,
      },
    });

    await this.webhookQueue.add(
      'process-whatsapp-status',
      { eventId: webhookEvent.id },
      { removeOnComplete: { count: 100 }, removeOnFail: false },
    );

    return { status: 'accepted' };
  }

  @Post('msg91')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle MSG91 SMS delivery status callbacks' })
  async handleMsg91Status(@Req() req: Request): Promise<{ status: string }> {
    const body = req.body as Msg91StatusItem[] | Msg91StatusItem;
    const items = Array.isArray(body) ? body : [body];

    if (items.length === 0 || !items[0]?.requestId) {
      return { status: 'ignored' };
    }

    const firstItem = items[0];
    const providerEventId = `${firstItem.requestId}-${firstItem.status}`;

    const existingEvent = await this.prisma.webhookEvent.findUnique({
      where: { providerEventId },
    });

    if (existingEvent) {
      return { status: 'already_processed' };
    }

    const webhookEvent = await this.prisma.webhookEvent.create({
      data: {
        provider: 'msg91',
        eventType: 'status_update',
        providerEventId,
        payload: body as unknown as Prisma.InputJsonValue,
        status: WebhookStatus.PENDING,
      },
    });

    await this.webhookQueue.add(
      'process-msg91-status',
      { eventId: webhookEvent.id },
      { removeOnComplete: { count: 100 }, removeOnFail: false },
    );

    return { status: 'accepted' };
  }
}
