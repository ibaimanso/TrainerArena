import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export const QUEUE_MAIL = 'mail';
export const QUEUE_ROUND_JOBS = 'round-jobs';
export const QUEUE_PAYMENT_JOBS = 'payment-jobs';
export const QUEUE_WEBHOOKS = 'webhooks';

export const MAIL_QUEUE = Symbol('MAIL_QUEUE');
export const ROUND_JOBS_QUEUE = Symbol('ROUND_JOBS_QUEUE');
export const PAYMENT_JOBS_QUEUE = Symbol('PAYMENT_JOBS_QUEUE');
export const WEBHOOKS_QUEUE = Symbol('WEBHOOKS_QUEUE');

export function bullConnection(config: ConfigService): { url: string } & Record<string, unknown> {
  const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
  return { url, maxRetriesPerRequest: null, enableOfflineQueue: true } as never;
}

function queueProvider(token: symbol, name: string) {
  return {
    provide: token,
    inject: [ConfigService],
    useFactory: (config: ConfigService): Queue =>
      new Queue(name, {
        connection: bullConnection(config),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      }),
  };
}

@Global()
@Module({
  providers: [
    queueProvider(MAIL_QUEUE, QUEUE_MAIL),
    queueProvider(ROUND_JOBS_QUEUE, QUEUE_ROUND_JOBS),
    queueProvider(PAYMENT_JOBS_QUEUE, QUEUE_PAYMENT_JOBS),
    queueProvider(WEBHOOKS_QUEUE, QUEUE_WEBHOOKS),
  ],
  exports: [MAIL_QUEUE, ROUND_JOBS_QUEUE, PAYMENT_JOBS_QUEUE, WEBHOOKS_QUEUE],
})
export class QueuesModule implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    // Queues are closed by process exit; workers handle their own shutdown.
  }
}
