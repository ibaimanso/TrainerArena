import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { bullConnection, QUEUE_MAIL } from '../queues/queues.module';
import { MailService } from './mail.service';
import type { MailMessage } from './mail.templates';

/** Processes the `mail` queue. Runs in-process unless RUN_WORKERS=false. */
@Injectable()
export class MailWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MailWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('RUN_WORKERS') === 'false') return;
    this.worker = new Worker<MailMessage>(
      QUEUE_MAIL,
      async (job) => {
        await this.mail.sendNow(job.data);
      },
      { connection: bullConnection(this.config) }
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Mail job ${job?.id} failed: ${err.message}`)
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
