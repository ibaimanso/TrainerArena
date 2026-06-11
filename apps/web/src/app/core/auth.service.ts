import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { RoleName } from '@apptorneos/shared';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  emailVerified: boolean;
  roles: RoleName[];
}

interface MeResponse {
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private loadPromise: Promise<void> | null = null;

  readonly user = signal<AuthUser | null>(null);
  readonly isLoggedIn = computed(() => this.user() !== null);
  readonly isVerified = computed(() => this.user()?.emailVerified ?? false);
  readonly isAdmin = computed(() => this.hasRole('admin') || this.hasRole('superadmin'));
  readonly isSuperadmin = computed(() => this.hasRole('superadmin'));
  readonly isJudge = computed(() => this.hasRole('judge'));

  hasRole(role: RoleName): boolean {
    return this.user()?.roles.includes(role) ?? false;
  }

  /** Loads the session user once (browser only; SSR renders as guest). */
  loadOnce(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return Promise.resolve();
    if (!this.loadPromise) {
      this.loadPromise = firstValueFrom(this.http.get<MeResponse>('/api/auth/me'))
        .then((res) => this.user.set(res.user))
        .catch(() => this.user.set(null));
    }
    return this.loadPromise;
  }

  async register(name: string, email: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<MeResponse>('/api/auth/register', { name, email, password })
    );
    this.user.set(res.user);
  }

  async login(email: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<MeResponse>('/api/auth/login', { email, password })
    );
    this.user.set(res.user);
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch {
      // Even if the server call fails (e.g. expired session), drop the local
      // session so the UI never gets stuck logged in.
    }
    this.user.set(null);
  }

  async refresh(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<MeResponse>('/api/auth/me'));
      this.user.set(res.user);
    } catch {
      this.user.set(null);
    }
  }

  verifyEmail(id: string, expires: string, signature: string): Promise<unknown> {
    return firstValueFrom(
      this.http.get('/api/auth/verify-email', { params: { id, expires, signature } })
    );
  }

  resendVerification(): Promise<unknown> {
    return firstValueFrom(this.http.post('/api/auth/resend-verification', {}));
  }

  forgotPassword(email: string): Promise<unknown> {
    return firstValueFrom(this.http.post('/api/auth/forgot-password', { email }));
  }

  resetPassword(email: string, token: string, password: string): Promise<unknown> {
    return firstValueFrom(this.http.post('/api/auth/reset-password', { email, token, password }));
  }

  async updateProfile(name: string, email: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.put<MeResponse>('/api/auth/profile', { name, email })
    );
    this.user.set(res.user);
  }

  changePassword(currentPassword: string, password: string): Promise<unknown> {
    return firstValueFrom(this.http.put('/api/auth/profile/password', { currentPassword, password }));
  }

  async deleteAccount(password: string): Promise<void> {
    await firstValueFrom(this.http.request('DELETE', '/api/auth/profile', { body: { password } }));
    this.user.set(null);
  }
}
