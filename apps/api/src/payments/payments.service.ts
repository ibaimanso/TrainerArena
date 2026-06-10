import { Inject, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Tournament } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { channels, events } from '@apptorneos/shared';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { paymentConfirmedEmail } from '../mail/mail.templates';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_JOBS_QUEUE } from '../queues/queues.module';
import { RealtimeService } from '../realtime/realtime.service';
import type { RegisterForTournamentDto } from '../registrations/registrations.dto';
import { PaypalClient } from './paypal.client';

export const EXPIRE_PENDING_REGISTRATION = 'expire-pending-registration';
const EXPIRE_DELAY_MS = 30 * 60 * 1000; // 30 min (SPEC §8.6)

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paypal: PaypalClient,
    private readonly mail: MailService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_JOBS_QUEUE) private readonly paymentJobs: Queue
  ) {}

  /**
   * Paid registration (SPEC §8.3): pending_payment + payment row inside the
   * locked transaction (seat reserved); PayPal order outside the lock with
   * rollback on failure; 30-min expiration job; returns the approval URL.
   */
  async registerPaid(
    tournament: Tournament,
    userId: number,
    dto: RegisterForTournamentDto
  ): Promise<{ approvalUrl: string }> {
    if (tournament.status !== 'registration_open') {
      throw new UnprocessableEntityException('Las inscripciones no están abiertas.');
    }

    const provisionalOrderId = `pending-${randomUUID()}`;
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournament.id} FOR UPDATE`;

      const existing = await tx.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
      });
      if (existing) {
        throw new UnprocessableEntityException('Ya estás inscrito en este torneo.');
      }
      const occupied = await tx.tournamentRegistration.count({
        where: { tournamentId: tournament.id, status: { in: ['active', 'pending_payment'] } },
      });
      if (occupied >= tournament.maxPlayers) {
        throw new UnprocessableEntityException('Torneo lleno.');
      }

      const registration = await tx.tournamentRegistration.create({
        data: {
          tournamentId: tournament.id,
          userId,
          status: 'pending_payment',
          fullName: dto.fullName,
          tcgLiveUsername: dto.tcgLiveUsername,
          email: dto.email,
          phone: dto.phone ?? null,
        },
      });
      const payment = await tx.payment.create({
        data: {
          tournamentId: tournament.id,
          userId,
          registrationId: registration.id,
          paypalOrderId: provisionalOrderId,
          amount: tournament.feeAmount,
          currency: tournament.feeCurrency,
          status: 'created',
          idempotencyKey: randomUUID(),
        },
      });
      return { registration, payment };
    });

    // Outside the lock: create the PayPal order; rollback (free the seat) on failure.
    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:4200');
    try {
      const order = await this.paypal.createOrder({
        amountCents: tournament.feeAmount,
        currency: tournament.feeCurrency,
        returnUrl: `${appUrl}/torneo/${tournament.slug}/pago/volver`,
        cancelUrl: `${appUrl}/pago/cancelar`,
        payeeEmail: tournament.paypalAccount,
        idempotencyKey: created.payment.idempotencyKey,
      });
      await this.prisma.payment.update({
        where: { id: created.payment.id },
        data: { paypalOrderId: order.orderId },
      });
      await this.paymentJobs.add(
        EXPIRE_PENDING_REGISTRATION,
        { paymentId: created.payment.id },
        { delay: EXPIRE_DELAY_MS }
      );
      return { approvalUrl: order.approvalUrl };
    } catch (error) {
      this.logger.error(`PayPal order creation failed: ${(error as Error).message}`);
      await this.prisma.payment.delete({ where: { id: created.payment.id } }).catch(() => undefined);
      await this.prisma.tournamentRegistration
        .delete({ where: { id: created.registration.id } })
        .catch(() => undefined);
      throw new UnprocessableEntityException(
        'No se pudo iniciar el pago con PayPal. Inténtalo de nuevo.'
      );
    }
  }

  /** Return page handler: capture the approved order; the webhook completes the flow. */
  async captureOnReturn(orderId: string): Promise<void> {
    await this.paypal.captureOrder(orderId);
  }

  /** Job (30 min): if still pending_payment → cancel locally and free the seat. */
  async expirePendingRegistration(paymentId: number): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { registration: true },
    });
    if (!payment || payment.status !== 'created') return;
    if (!payment.registration || payment.registration.status !== 'pending_payment') return;

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'cancelled' },
      }),
      this.prisma.tournamentRegistration.delete({ where: { id: payment.registration.id } }),
    ]);
    await this.audit.log({
      action: 'payment.expired',
      targetType: 'payment',
      targetId: payment.id,
      payload: { tournament_id: payment.tournamentId, user_id: payment.userId },
    });
  }

  /** Async webhook processing (SPEC §8.5). */
  async processWebhookEvent(eventId: number): Promise<void> {
    const event = await this.prisma.paypalWebhookEvent.findUnique({ where: { id: eventId } });
    if (!event || event.processedAt) return;

    const payload = event.payload as {
      resource?: {
        id?: string;
        supplementary_data?: { related_ids?: { order_id?: string } };
      };
    };
    const orderId =
      payload.resource?.supplementary_data?.related_ids?.order_id ?? payload.resource?.id;

    const finish = async (status: 'completed' | 'failed' | 'cancelled' | 'ignored' | 'no_payment') => {
      await this.prisma.paypalWebhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), processedStatus: status },
      });
      await this.audit.log({
        action: 'paypal.webhook_processed',
        targetType: 'paypal_webhook_event',
        targetId: event.id,
        payload: { event_type: event.eventType, status },
      });
    };

    const handled = ['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.DENIED', 'CHECKOUT.ORDER.VOIDED'];
    if (!handled.includes(event.eventType)) {
      await finish('ignored');
      return;
    }

    const payment = orderId
      ? await this.prisma.payment.findUnique({
          where: { paypalOrderId: orderId },
          include: { registration: true, tournament: true },
        })
      : null;
    if (!payment) {
      await finish('no_payment');
      return;
    }

    switch (event.eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        const captureId = payload.resource?.id ?? null;
        await this.prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'completed',
              paypalCaptureId: captureId,
              completedAt: new Date(),
            },
          });
          if (payment.registration && payment.registration.status === 'pending_payment') {
            await tx.tournamentRegistration.update({
              where: { id: payment.registration.id },
              data: { status: 'active' },
            });
          }
        });
        if (payment.registration) {
          const appUrl = this.config.get<string>('APP_URL', 'http://localhost:4200');
          await this.mail.enqueue(
            paymentConfirmedEmail(
              payment.registration.email,
              payment.registration.fullName,
              payment.tournament.name,
              payment.amount,
              payment.currency,
              `${appUrl}/torneo/${payment.tournament.slug}`
            )
          );
          await this.realtime.trigger(
            channels.tournamentAdmin(payment.tournamentId),
            events.registrationCreated,
            {
              registration_id: payment.registration.id,
              tournament_id: payment.tournamentId,
              full_name: payment.registration.fullName,
              status: 'active',
            }
          );
        }
        await finish('completed');
        break;
      }
      case 'PAYMENT.CAPTURE.DENIED': {
        await this.prisma.$transaction(async (tx) => {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
          if (payment.registration) {
            await tx.tournamentRegistration.delete({ where: { id: payment.registration.id } });
          }
        });
        await finish('failed');
        break;
      }
      case 'CHECKOUT.ORDER.VOIDED': {
        await this.prisma.$transaction(async (tx) => {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'cancelled' } });
          if (payment.registration) {
            await tx.tournamentRegistration.delete({ where: { id: payment.registration.id } });
          }
        });
        await finish('cancelled');
        break;
      }
    }
  }
}
