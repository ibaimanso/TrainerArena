import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { bullConnection, QUEUE_ROUND_JOBS } from '../queues/queues.module';
import { CHECK_IN_WINDOW_EXPIRED, ROUND_TIME_EXPIRED, RoundsService } from './rounds.service';

/** Round timers (SPEC §6.4/§6.6): exact-delay jobs, never client clocks. */
@Injectable()
export class RoundsWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RoundsWorker.name);
  private worker: Worker | null = null;

  constructor(
    private readonly rounds: RoundsService,
    private readonly config: ConfigService
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('RUN_WORKERS') === 'false') return;
    this.worker = new Worker<{ roundId: number }>(
      QUEUE_ROUND_JOBS,
      async (job) => {
        if (job.name === CHECK_IN_WINDOW_EXPIRED) {
          await this.rounds.checkInWindowExpired(job.data.roundId);
        } else if (job.name === ROUND_TIME_EXPIRED) {
          await this.rounds.roundTimeExpired(job.data.roundId);
        }
      },
      { connection: bullConnection(this.config) }
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Round job ${job?.name} ${job?.id} failed: ${err.message}`)
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
