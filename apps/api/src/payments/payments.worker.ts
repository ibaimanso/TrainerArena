import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { bullConnection, QUEUE_PAYMENT_JOBS, QUEUE_WEBHOOKS } from '../queues/queues.module';
import { EXPIRE_PENDING_REGISTRATION, PaymentsService } from './payments.service';
import { PROCESS_WEBHOOK_EVENT } from './webhook.controller';

/** Processes payment expirations and PayPal webhook events. */
@Injectable()
export class PaymentsWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PaymentsWorker.name);
  private workers: Worker[] = [];

  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('RUN_WORKERS') === 'false') return;
    const connection = bullConnection(this.config);

    this.workers.push(
      new Worker<{ paymentId: number }>(
        QUEUE_PAYMENT_JOBS,
        async (job) => {
          if (job.name === EXPIRE_PENDING_REGISTRATION) {
            await this.payments.expirePendingRegistration(job.data.paymentId);
          }
        },
        { connection }
      ),
      new Worker<{ eventId: number }>(
        QUEUE_WEBHOOKS,
        async (job) => {
          if (job.name === PROCESS_WEBHOOK_EVENT) {
            await this.payments.processWebhookEvent(job.data.eventId);
          }
        },
        { connection }
      )
    );
    for (const worker of this.workers) {
      worker.on('failed', (job, err) =>
        this.logger.error(`Job ${job?.name} ${job?.id} failed: ${err.message}`)
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
  }
}
