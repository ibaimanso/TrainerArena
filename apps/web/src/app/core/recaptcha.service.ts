import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

declare global {
  interface Window {
    grecaptcha?: {
      ready(cb: () => void): void;
      execute(siteKey: string, opts: { action: string }): Promise<string>;
    };
  }
}

/**
 * reCAPTCHA v3 (invisible, score-based). The site key comes from
 * GET /api/config; when it is not configured the service is a no-op and the
 * app works without Google (local dev). Action names must match the backend
 * @Recaptcha() decorators.
 */
@Injectable({ providedIn: 'root' })
export class RecaptchaService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private loadPromise: Promise<string | null> | null = null;

  /** True once the site key is known to exist (footer shows the attribution). */
  readonly enabled = signal(false);

  /** Warm up config + script (called once from the app shell). */
  init(): void {
    void this.load();
  }

  private load(): Promise<string | null> {
    if (!isPlatformBrowser(this.platformId)) return Promise.resolve(null);
    if (!this.loadPromise) {
      this.loadPromise = firstValueFrom(
        this.http.get<{ recaptchaSiteKey: string | null }>('/api/config')
      )
        .then((cfg) => {
          const key = cfg.recaptchaSiteKey;
          if (!key) return null;
          this.enabled.set(true);
          return new Promise<string | null>((resolve) => {
            const script = document.createElement('script');
            script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(key)}`;
            script.async = true;
            script.onload = () => resolve(key);
            script.onerror = () => resolve(null);
            document.head.appendChild(script);
          });
        })
        .catch(() => null);
    }
    return this.loadPromise;
  }

  /** Token for the action, or null when reCAPTCHA is disabled/unavailable. */
  async execute(action: string): Promise<string | null> {
    const key = await this.load();
    if (!key || !window.grecaptcha) return null;
    try {
      await new Promise<void>((resolve) => window.grecaptcha?.ready(resolve));
      return await window.grecaptcha.execute(key, { action });
    } catch {
      return null;
    }
  }

  /** Headers object for HttpClient options (empty when disabled). */
  async headers(action: string): Promise<Record<string, string>> {
    const token = await this.execute(action);
    return token ? { 'X-Recaptcha-Token': token } : {};
  }
}
