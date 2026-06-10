import { Injectable, signal } from '@angular/core';

/**
 * Authoritative server clock (SPEC §11): the offset is computed once from the
 * X-Server-Now header and reused to render countdowns. The client clock is
 * never trusted on its own.
 */
@Injectable({ providedIn: 'root' })
export class ServerTimeService {
  private readonly offsetMs = signal(0);
  private calibrated = false;

  /** Called by the HTTP interceptor with each response's server clock. */
  calibrate(serverNowIso: string): void {
    if (this.calibrated) return;
    const serverNow = Date.parse(serverNowIso);
    if (Number.isNaN(serverNow)) return;
    this.offsetMs.set(serverNow - Date.now());
    this.calibrated = true;
  }

  /** Server "now" in epoch ms. */
  now(): number {
    return Date.now() + this.offsetMs();
  }

  /** Remaining ms until an ISO deadline (clamped to 0). */
  remainingMs(endsAtIso: string): number {
    return Math.max(0, Date.parse(endsAtIso) - this.now());
  }
}
