import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-sm">
      <h1 class="page-title mb-2 text-center">Crear cuenta</h1>
      <p class="mb-6 text-center text-sm text-stone-500 dark:text-stone-400">
        Crea tu cuenta para inscribirte y jugar tus torneos.
      </p>

      <form [formGroup]="form" (ngSubmit)="submit()" class="card space-y-5">
        @if (error()) {
          <p class="alert-error" role="alert">{{ error() }}</p>
        }
        <div>
          <label for="name" class="label">Nombre</label>
          <input id="name" type="text" formControlName="name" autocomplete="name" maxlength="120"
                 required class="input" placeholder="Tu nombre" />
          <p class="hint">Así te verán tus rivales en los emparejamientos.</p>
        </div>
        <div>
          <label for="email" class="label">Email</label>
          <input id="email" type="email" formControlName="email" autocomplete="email"
                 required class="input" placeholder="tu@email.com" />
        </div>
        <div>
          <label for="password" class="label">Contraseña</label>
          <input id="password" type="password" formControlName="password" autocomplete="new-password"
                 required class="input" />
          <p class="hint">Mínimo 8 caracteres.</p>
        </div>
        <button type="submit" [disabled]="form.invalid || loading()" class="btn-primary w-full">
          {{ loading() ? 'Creando cuenta…' : 'Crear cuenta' }}
        </button>
        <p class="border-t border-stone-100 dark:border-stone-800 pt-4 text-center text-sm text-stone-500 dark:text-stone-400">
          ¿Ya tienes cuenta?
          <a routerLink="/login" class="link">Inicia sesión</a>
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
