import { Controller, Headers, HttpCode, Inject, Post, RawBodyRequest, Req } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { Public } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { WEBHOOKS_QUEUE } from '../queues/queues.module';
import { PaypalClient } from './paypal.client';

export const PROCESS_WEBHOOK_EVENT = 'process-paypal-webhook';

/**
 * PayPal webhook (SPEC §8.5): public, CSRF-exempt, verifies the signature with
 * the RAW body. Invalid signature ⇒ 200 OK without processing (no hints).
 * Idempotent by paypal_event_id. Responds 200 immediately; processing is async.
 */
@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paypal: PaypalClient,
    @Inject(WEBHOOKS_QUEUE) private readonly webhooks: Queue
  ) {}

  @Public()
  @Post('paypal')
  @HttpCode(200)
  async handlePaypal(
    @Req() req: RawBodyRequest<Request>,
    @Headers('paypal-transmission-id') transmissionId: string,
    @Headers('paypal-transmission-time') transmissionTime: string,
    @Headers('paypal-transmission-sig') transmissionSig: string,
    @Headers('paypal-cert-url') certUrl: string,
    @Headers('paypal-auth-algo') authAlgo: string
  ): Promise<{ received: true }> {
    const rawBody = req.rawBody?.toString('utf8');
    if (!rawBody || !transmissionId || !transmissionSig) {
      return { received: true };
    }

    const valid = await this.paypal.verifyWebhookSignature({
      transmissionId,
      transmissionTime,
      transmissionSig,
      certUrl,
      authAlgo,
      rawBody,
    });
    if (!valid) {
      return { received: true }; // inert 200, no hints
    }

    let parsed: { id?: string; event_type?: string };
    try {
      parsed = JSON.parse(rawBody) as { id?: string; event_type?: string };
    } catch {
      return { received: true };
    }
    if (!parsed.id || !parsed.event_type) {
      return { received: true };
    }

    try {
      const event = await this.prisma.paypalWebhookEvent.create({
        data: {
          paypalEventId: parsed.id,
          eventType: parsed.event_type,
          payload: JSON.parse(rawBody) as Prisma.InputJsonValue,
        },
      });
      await this.webhooks.add(PROCESS_WEBHOOK_EVENT, { eventId: event.id });
    } catch (error) {
      // Unique violation = duplicate delivery → idempotent 200.
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      ) {
        throw error;
      }
    }
    return { received: true };
  }
}
