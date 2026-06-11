import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';

type State = 'notice' | 'verifying' | 'verified' | 'error';

/**
 * Two modes: with id/expires/signature query params it confirms the link from
 * the email; without them it shows the "check your inbox" notice with resend.
 */
@Component({
  imports: [RouterLink],
  template: `
    <div class="mx-auto max-w-md">
      <h1 class="page-title mb-2 text-center">Verificación de email</h1>
      <p class="mb-6 text-center text-sm text-stone-500 dark:text-stone-400">
        Necesitas verificar tu email para inscribirte en torneos.
      </p>
      <div class="card space-y-5">
        @switch (state()) {
          @case ('verifying') {
            <div class="space-y-3" role="status" aria-label="Verificando tu dirección de email">
              <p class="text-sm text-stone-600 dark:text-stone-400">Verificando tu dirección de email…</p>
              <div class="skeleton h-4 w-2/3"></div>
              <div class="skeleton h-4 w-1/2"></div>
            </div>
          }
          @case ('verified') {
            <p class="alert-success" role="status">
              ¡Tu email ha sido verificado! Ya puedes usar todas las funciones.
            </p>
            <a routerLink="/" class="btn-primary w-full">Ir a los torneos</a>
          }
          @case ('error') {
            <p class="alert-error" role="alert">{{ error() }}</p>
            @if (auth.isLoggedIn()) {
              <button type="button" (click)="resend()" [disabled]="resending()" class="btn-primary w-full">
                Enviar un nuevo enlace
              </button>
            }
          }
          @default {
            @if (auth.isVerified()) {
              <p class="alert-success" role="status">Tu email ya está verificado.</p>
            } @else {
              <p class="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                Te hemos enviado un email con un enlace de verificación. Revisa tu bandeja de
                entrada (y la carpeta de spam). Debes verificar tu email para poder inscribirte
                en torneos.
              </p>
              @if (resent()) {
                <p class="alert-success" role="status">Enlace reenviado. Revisa tu bandeja de entrada.</p>
              }
              @if (error()) {
                <p class="alert-error" role="alert">{{ error() }}</p>
              }
              @if (auth.isLoggedIn()) {
                <button type="button" (click)="resend()" [disabled]="resending()" class="btn-primary w-full">
                  {{ resending() ? 'Enviando…' : 'Reenviar enlace' }}
                </button>
              } @else {
                <p class="border-t border-stone-100 dark:border-stone-800 pt-4 text-center text-sm text-stone-500 dark:text-stone-400">
                  <a routerLink="/login" class="link">Inicia sesión</a>
                  para reenviar el enlace.
                </p>
              }
            }
          }
        }
      </div>
    </div>
  `,
})
export default class VerifyEmailPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly state = signal<State>('notice');
  protected readonly error = signal<string | null>(null);
  protected readonly resending = signal(false);
  protected readonly resent = signal(false);

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const id = params.get('id');
    const expires = params.get('expires');
    const signature = params.get('signature');
    if (id && expires && signature) {
      this.state.set('verifying');
      try {
        await this.auth.verifyEmail(id, expires, signature);
        await this.auth.refresh();
        this.state.set('verified');
      } catch (e) {
        this.error.set(apiErrorMessage(e));
        this.state.set('error');
      }
    }
  }

  protected async resend(): Promise<void> {
    this.resending.set(true);
    this.error.set(null);
    try {
      await this.auth.resendVerification();
      this.resent.set(true);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.resending.set(false);
    }
  }
}
