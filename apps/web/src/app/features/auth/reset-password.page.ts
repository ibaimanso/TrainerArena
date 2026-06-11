import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-sm">
      <h1 class="page-title mb-2 text-center">Restablecer contraseña</h1>
      <p class="mb-6 text-center text-sm text-stone-500 dark:text-stone-400">
        Elige una nueva contraseña para tu cuenta.
      </p>

      <form [formGroup]="form" (ngSubmit)="submit()" class="card space-y-5">
        @if (error()) {
          <p class="alert-error" role="alert">{{ error() }}</p>
        }
        <div>
          <label for="password" class="label">Nueva contraseña</label>
          <input id="password" type="password" formControlName="password" autocomplete="new-password"
                 required class="input" />
          <p class="hint">Mínimo 8 caracteres.</p>
        </div>
        <button type="submit" [disabled]="form.invalid || loading()" class="btn-primary w-full">
          {{ loading() ? 'Guardando…' : 'Restablecer contraseña' }}
        </button>
        <p class="border-t border-stone-100 dark:border-stone-800 pt-4 text-center text-sm text-stone-500 dark:text-stone-400">
          <a routerLink="/login" class="link">Volver a iniciar sesión</a>
        </p>
      </form>
    </div>
  `,
})
export default class ResetPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) return;
    const params = this.route.snapshot.queryParamMap;
    const token = params.get('token') ?? '';
    const email = params.get('email') ?? '';
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.resetPassword(email, token, this.form.getRawValue().password);
      await this.router.navigate(['/login'], { queryParams: { restablecida: 1 } });
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
