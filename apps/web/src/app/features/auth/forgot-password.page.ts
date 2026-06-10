import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-sm">
      <h1 class="mb-6 text-2xl font-bold">Recuperar contraseña</h1>

      <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4 rounded-lg bg-white p-6 shadow">
        @if (sent()) {
          <p class="rounded bg-green-50 px-3 py-2 text-sm text-green-800">
            Si existe una cuenta con ese email, recibirás un enlace para restablecer la
            contraseña. El enlace caduca en 60 minutos.
          </p>
        } @else {
          @if (error()) {
            <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
          }
          <p class="text-sm text-zinc-600">
            Introduce tu email y te enviaremos un enlace para restablecer la contraseña.
          </p>
          <div>
            <label for="email" class="mb-1 block text-sm font-medium">Email</label>
            <input id="email" type="email" formControlName="email" autocomplete="email"
                   class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
          </div>
          <button type="submit" [disabled]="form.invalid || loading()"
                  class="w-full rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {{ loading() ? 'Enviando…' : 'Enviar enlace' }}
          </button>
        }
        <p class="text-sm">
          <a routerLink="/login" class="text-indigo-600 hover:underline">Volver a iniciar sesión</a>
        </p>
      </form>
    </div>
  `,
})
export default class ForgotPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  protected readonly loading = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.forgotPassword(this.form.getRawValue().email);
      this.sent.set(true);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
