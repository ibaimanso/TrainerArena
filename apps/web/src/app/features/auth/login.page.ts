import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-sm">
      <h1 class="page-title mb-2 text-center">Iniciar sesión</h1>
      <p class="mb-6 text-center text-sm text-stone-500 dark:text-stone-400">
        Accede para inscribirte y jugar tus torneos.
      </p>

      <form [formGroup]="form" (ngSubmit)="submit()" class="card space-y-5">
        @if (error()) {
          <p class="alert-error" role="alert">{{ error() }}</p>
        }
        <div>
          <label for="email" class="label">Email</label>
          <input id="email" type="email" formControlName="email" autocomplete="email"
                 required class="input" placeholder="tu@email.com" />
        </div>
        <div>
          <div class="mb-1.5 flex items-center justify-between">
            <label for="password" class="label mb-0">Contraseña</label>
            <a routerLink="/recuperar-contrasena" class="link text-xs">
              ¿La has olvidado?
            </a>
          </div>
          <input id="password" type="password" formControlName="password" autocomplete="current-password"
                 required class="input" />
        </div>
        <button type="submit" [disabled]="form.invalid || loading()" class="btn-primary w-full">
          {{ loading() ? 'Entrando…' : 'Entrar' }}
        </button>
        <p class="border-t border-stone-100 dark:border-stone-800 pt-4 text-center text-sm text-stone-500 dark:text-stone-400">
          ¿Aún no tienes cuenta?
          <a routerLink="/registro" class="link">Crear cuenta</a>
        </p>
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
