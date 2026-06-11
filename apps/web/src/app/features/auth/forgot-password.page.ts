import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-sm">
      <h1 class="page-title mb-2 text-center">Recuperar contraseña</h1>
      <p class="mb-6 text-center text-sm text-stone-500 dark:text-stone-400">
        Te enviaremos un enlace para restablecerla.
      </p>

      <form [formGroup]="form" (ngSubmit)="submit()" class="card space-y-5">
        @if (sent()) {
          <p class="alert-success" role="status">
            Si existe una cuenta con ese email, recibirás un enlace para restablecer la
            contraseña. El enlace caduca en 60 minutos.
          </p>
        } @else {
          @if (error()) {
            <p class="alert-error" role="alert">{{ error() }}</p>
          }
          <div>
            <label for="email" class="label">Email</label>
            <input id="email" type="email" formControlName="email" autocomplete="email"
                   required class="input" placeholder="tu@email.com" />
            <p class="hint">Introduce el email con el que te registraste.</p>
          </div>
          <button type="submit" [disabled]="form.invalid || loading()" class="btn-primary w-full">
            {{ loading() ? 'Enviando…' : 'Enviar enlace' }}
          </button>
        }
        <p class="border-t border-stone-100 dark:border-stone-800 pt-4 text-center text-sm text-stone-500 dark:text-stone-400">
          <a routerLink="/login" class="link">Volver a iniciar sesión</a>
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
