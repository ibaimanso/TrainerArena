import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { createTransport, type Transporter } from 'nodemailer';
import { MAIL_QUEUE } from '../queues/queues.module';
import type { MailMessage } from './mail.templates';

/**
 * All sending is queued in BullMQ (`mail` queue); the worker calls sendNow().
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(
    @Inject(MAIL_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService
  ) {}

  /** Enqueue an email for asynchronous delivery. */
  async enqueue(message: MailMessage): Promise<void> {
    try {
      await this.queue.add('send', message);
    } catch (error) {
      // Mail must never break the main operation; log and continue.
      this.logger.error(`Could not enqueue mail to ${message.to}`, error as Error);
    }
  }

  /** Deliver immediately via SMTP (called by the mail worker). */
  async sendNow(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      const user = this.config.get<string>('MAIL_USER');
      this.transporter = createTransport({
        host: this.config.get<string>('MAIL_HOST', 'localhost'),
        port: Number(this.config.get<string>('MAIL_PORT', '1025')),
        secure: this.config.get<string>('MAIL_SECURE') === 'true',
        auth: user
          ? { user, pass: this.config.get<string>('MAIL_PASSWORD', '') }
          : undefined,
      });
    }
    await this.transporter.sendMail({
      from: `"${this.config.get<string>('MAIL_FROM_NAME', 'AppTorneos')}" <${this.config.get<string>(
        'MAIL_FROM_ADDRESS',
        'torneos@apptorneos.local'
      )}>`,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
  }
}
