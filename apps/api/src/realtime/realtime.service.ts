import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Pusher from 'pusher';

/**
 * Broadcast service over Soketi (Pusher protocol, SPEC §11).
 * Emit ONLY after the originating transaction has committed.
 * Failures are logged and never break the main operation.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly pusher: Pusher;

  constructor(config: ConfigService) {
    this.pusher = new Pusher({
      appId: config.get<string>('PUSHER_APP_ID', 'apptorneos'),
      key: config.get<string>('PUSHER_APP_KEY', 'apptorneos-key'),
      secret: config.get<string>('PUSHER_APP_SECRET', 'apptorneos-secret'),
      host: config.get<string>('PUSHER_HOST', 'localhost'),
      port: config.get<string>('PUSHER_PORT', '6001'),
      useTLS: config.get<string>('PUSHER_USE_TLS') === 'true',
    });
  }

  async trigger(channel: string, event: string, payload: unknown): Promise<void> {
    try {
      await this.pusher.trigger(channel, event, payload);
    } catch (error) {
      this.logger.warn(`Broadcast failed (${channel} ${event}): ${(error as Error).message}`);
    }
  }

  /** Channel auth signature for private channels (used by the auth endpoint, SPEC §11). */
  authorizeChannel(socketId: string, channel: string): Pusher.ChannelAuthResponse {
    return this.pusher.authorizeChannel(socketId, channel);
  }
}
