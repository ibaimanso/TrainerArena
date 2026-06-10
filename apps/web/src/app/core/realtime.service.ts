import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import Pusher, { type Channel } from 'pusher-js';

interface RealtimeConfig {
  key: string;
  host: string;
  port: number;
  useTls: boolean;
}

/**
 * Single pusher-js wrapper (SPEC §11). The app must keep working without
 * WebSockets: consumers combine subscribe() with their own soft polling.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private pusher: Pusher | null = null;
  private connecting: Promise<Pusher | null> | null = null;

  /** True when the socket is connected; pages can relax their polling. */
  readonly connected = signal(false);

  private async client(): Promise<Pusher | null> {
    if (!isPlatformBrowser(this.platformId)) return null;
    if (this.pusher) return this.pusher;
    if (!this.connecting) {
      this.connecting = (async () => {
        try {
          const config = await firstValueFrom(this.http.get<RealtimeConfig>('/api/realtime/config'));
          const pusher = new Pusher(config.key, {
            wsHost: config.host,
            wsPort: config.port,
            wssPort: config.port,
            forceTLS: config.useTls,
            enabledTransports: config.useTls ? ['wss'] : ['ws'],
            cluster: 'mt1', // unused by Soketi but required by pusher-js
            channelAuthorization: {
              endpoint: '/api/broadcasting/auth',
              transport: 'ajax',
              headersProvider: () => {
                const token = document.cookie
                  .split('; ')
                  .find((c) => c.startsWith('XSRF-TOKEN='))
                  ?.split('=')[1];
                return token ? { 'X-XSRF-TOKEN': token } : {};
              },
            },
          });
          pusher.connection.bind('connected', () => this.connected.set(true));
          pusher.connection.bind('disconnected', () => this.connected.set(false));
          pusher.connection.bind('unavailable', () => this.connected.set(false));
          this.pusher = pusher;
          return pusher;
        } catch {
          return null; // degrade silently to polling
        }
      })();
    }
    return this.connecting;
  }

  /** Subscribes and binds events; returns an unsubscribe function. */
  async subscribe(
    channelName: string,
    bindings: Record<string, (payload: unknown) => void>
  ): Promise<() => void> {
    const pusher = await this.client();
    if (!pusher) return () => undefined;
    let channel: Channel;
    try {
      channel = pusher.subscribe(channelName);
    } catch {
      return () => undefined;
    }
    for (const [event, handler] of Object.entries(bindings)) {
      channel.bind(event, handler);
    }
    return () => {
      for (const [event, handler] of Object.entries(bindings)) {
        channel.unbind(event, handler);
      }
      pusher.unsubscribe(channelName);
    };
  }
}
