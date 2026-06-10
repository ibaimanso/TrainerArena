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
      <h1 class="mb-6 text-2xl font-bold">Verificación de email</h1>
      <div class="space-y-4 rounded-lg bg-white p-6 shadow">
        @switch (state()) {
          @case ('verifying') {
            <p class="text-sm text-zinc-600">Verificando tu dirección de email…</p>
          }
          @case ('verified') {
            <p class="rounded bg-green-50 px-3 py-2 text-sm text-green-800">
              ¡Tu email ha sido verificado! Ya puedes usar todas las funciones.
            </p>
            <a routerLink="/" class="inline-block rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500">
              Ir a los torneos
            </a>
          }
          @case ('error') {
            <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
            @if (auth.isLoggedIn()) {
              <button type="button" (click)="resend()" [disabled]="resending()"
                      class="rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                Enviar un nuevo enlace
              </button>
            }
          }
          @default {
            @if (auth.isVerified()) {
              <p class="rounded bg-green-50 px-3 py-2 text-sm text-green-800">Tu email ya está verificado.</p>
            } @else {
              <p class="text-sm text-zinc-600">
                Te hemos enviado un email con un enlace de verificación. Revisa tu bandeja de
                entrada (y la carpeta de spam). Debes verificar tu email para poder inscribirte
                en torneos.
              </p>
              @if (resent()) {
                <p class="rounded bg-green-50 px-3 py-2 text-sm text-green-800">Enlace reenviado.</p>
              }
              @if (error()) {
                <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
              }
              @if (auth.isLoggedIn()) {
                <button type="button" (click)="resend()" [disabled]="resending()"
                        class="rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                  {{ resending() ? 'Enviando…' : 'Reenviar enlace' }}
                </button>
              } @else {
                <p class="text-sm">
                  <a routerLink="/login" class="text-indigo-600 hover:underline">Inicia sesión</a>
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
