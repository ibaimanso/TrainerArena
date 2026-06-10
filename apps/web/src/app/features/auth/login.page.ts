import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-sm">
      <h1 class="mb-6 text-2xl font-bold">Iniciar sesión</h1>

      <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4 rounded-lg bg-white p-6 shadow">
        @if (error()) {
          <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
        }
        <div>
          <label for="email" class="mb-1 block text-sm font-medium">Email</label>
          <input id="email" type="email" formControlName="email" autocomplete="email"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
        </div>
        <div>
          <label for="password" class="mb-1 block text-sm font-medium">Contraseña</label>
          <input id="password" type="password" formControlName="password" autocomplete="current-password"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
        </div>
        <button type="submit" [disabled]="form.invalid || loading()"
                class="w-full rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
          {{ loading() ? 'Entrando…' : 'Entrar' }}
        </button>
        <div class="flex justify-between text-sm">
          <a routerLink="/recuperar-contrasena" class="text-indigo-600 hover:underline">¿Olvidaste tu contraseña?</a>
          <a routerLink="/registro" class="text-indigo-600 hover:underline">Crear cuenta</a>
        </div>
      </form>
    </div>
  `,
})
export default class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
      const volver = this.route.snapshot.queryParamMap.get('volver');
      await this.router.navigateByUrl(volver && volver.startsWith('/') ? volver : '/');
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
