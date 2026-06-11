import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

const STORAGE_KEY = 'ta-theme';

/**
 * Light/dark theme. The inline script in index.html applies the saved (or
 * system) theme before first paint; this service syncs the signal with the
 * DOM and persists explicit user choices.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);

  readonly dark = signal(false);

  init(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.dark.set(document.documentElement.classList.contains('dark'));
  }

  toggle(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const dark = !this.dark();
    this.dark.set(dark);
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      // Storage unavailable (privacy mode): the choice lasts for the session.
    }
  }
}
