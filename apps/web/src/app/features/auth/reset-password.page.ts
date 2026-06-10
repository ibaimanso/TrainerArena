import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-sm">
      <h1 class="mb-6 text-2xl font-bold">Restablecer contraseña</h1>

      <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4 rounded-lg bg-white p-6 shadow">
        @if (error()) {
          <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
        }
        <div>
          <label for="password" class="mb-1 block text-sm font-medium">Nueva contraseña</label>
          <input id="password" type="password" formControlName="password" autocomplete="new-password"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
          <p class="mt-1 text-xs text-zinc-500">Mínimo 8 caracteres.</p>
        </div>
        <button type="submit" [disabled]="form.invalid || loading()"
                class="w-full rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
          {{ loading() ? 'Guardando…' : 'Restablecer contraseña' }}
        </button>
        <p class="text-sm">
          <a routerLink="/login" class="text-indigo-600 hover:underline">Volver a iniciar sesión</a>
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
