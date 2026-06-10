import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-sm">
      <h1 class="mb-6 text-2xl font-bold">Crear cuenta</h1>

      <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4 rounded-lg bg-white p-6 shadow">
        @if (error()) {
          <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
        }
        <div>
          <label for="name" class="mb-1 block text-sm font-medium">Nombre</label>
          <input id="name" type="text" formControlName="name" autocomplete="name" maxlength="120"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
        </div>
        <div>
          <label for="email" class="mb-1 block text-sm font-medium">Email</label>
          <input id="email" type="email" formControlName="email" autocomplete="email"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
        </div>
        <div>
          <label for="password" class="mb-1 block text-sm font-medium">Contraseña</label>
          <input id="password" type="password" formControlName="password" autocomplete="new-password"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
          <p class="mt-1 text-xs text-zinc-500">Mínimo 8 caracteres.</p>
        </div>
        <button type="submit" [disabled]="form.invalid || loading()"
                class="w-full rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
          {{ loading() ? 'Creando cuenta…' : 'Crear cuenta' }}
        </button>
        <p class="text-sm">
          ¿Ya tienes cuenta?
          <a routerLink="/login" class="text-indigo-600 hover:underline">Inicia sesión</a>
        </p>
      </form>
    </div>
  `,
})
export default class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const { name, email, password } = this.form.getRawValue();
      await this.auth.register(name, email, password);
      await this.router.navigateByUrl('/verificar-email');
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
