import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';

@Component({
  imports: [ReactiveFormsModule],
  template: `
    <div class="mx-auto max-w-xl space-y-6">
      <div>
        <h1 class="page-title">Mi perfil</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Gestiona tus datos, tu contraseña y tu cuenta.</p>
      </div>

      <form [formGroup]="profileForm" (ngSubmit)="saveProfile()"
            class="card space-y-5" aria-labelledby="titulo-datos">
        <h2 id="titulo-datos" class="section-title">Datos de la cuenta</h2>
        @if (profileMessage()) {
          <p class="alert-success" role="status">{{ profileMessage() }}</p>
        }
        @if (profileError()) {
          <p class="alert-error" role="alert">{{ profileError() }}</p>
        }
        <div>
          <label for="name" class="label">Nombre</label>
          <input id="name" type="text" formControlName="name" autocomplete="name" maxlength="120"
                 required class="input" />
          <p class="hint">Así te verán tus rivales en los emparejamientos.</p>
        </div>
        <div>
          <label for="email" class="label">Email</label>
          <input id="email" type="email" formControlName="email" autocomplete="email"
                 required class="input" />
          <p class="hint">Si cambias el email tendrás que verificarlo de nuevo.</p>
        </div>
        <div class="flex justify-end">
          <button type="submit" [disabled]="profileForm.invalid || savingProfile()" class="btn-primary">
            {{ savingProfile() ? 'Guardando…' : 'Guardar cambios' }}
          </button>
        </div>
      </form>

      <form [formGroup]="passwordForm" (ngSubmit)="changePassword()"
            class="card space-y-5" aria-labelledby="titulo-contrasena">
        <h2 id="titulo-contrasena" class="section-title">Cambiar contraseña</h2>
        @if (passwordMessage()) {
          <p class="alert-success" role="status">{{ passwordMessage() }}</p>
        }
        @if (passwordError()) {
          <p class="alert-error" role="alert">{{ passwordError() }}</p>
        }
        <div>
          <label for="currentPassword" class="label">Contraseña actual</label>
          <input id="currentPassword" type="password" formControlName="currentPassword" autocomplete="current-password"
                 required class="input" />
        </div>
        <div>
          <label for="newPassword" class="label">Nueva contraseña</label>
          <input id="newPassword" type="password" formControlName="password" autocomplete="new-password"
                 required class="input" />
          <p class="hint">Mínimo 8 caracteres.</p>
        </div>
        <div class="flex justify-end">
          <button type="submit" [disabled]="passwordForm.invalid || savingPassword()" class="btn-primary">
            {{ savingPassword() ? 'Guardando…' : 'Cambiar contraseña' }}
          </button>
        </div>
      </form>

      <form [formGroup]="deleteForm" (ngSubmit)="deleteAccount()"
            class="card space-y-5 border-red-200 dark:border-red-900" aria-labelledby="titulo-borrar">
        <h2 id="titulo-borrar" class="section-title text-red-700 dark:text-red-400">Eliminar cuenta</h2>
        <p class="alert-warning">
          Esta acción es <strong>permanente</strong>: se eliminarán tu cuenta, tus inscripciones
          y tus datos, y no se puede deshacer. Introduce tu contraseña para confirmar.
        </p>
        @if (deleteError()) {
          <p class="alert-error" role="alert">{{ deleteError() }}</p>
        }
        <div>
          <label for="deletePassword" class="label">Contraseña</label>
          <input id="deletePassword" type="password" formControlName="password" autocomplete="current-password"
                 required class="input" />
        </div>
        <div class="flex justify-end">
          <button type="submit" [disabled]="deleteForm.invalid || deleting()" class="btn-danger">
            {{ deleting() ? 'Eliminando…' : 'Eliminar mi cuenta' }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export default class ProfilePage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly savingProfile = signal(false);
  protected readonly profileMessage = signal<string | null>(null);
  protected readonly profileError = signal<string | null>(null);
  protected readonly savingPassword = signal(false);
  protected readonly passwordMessage = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly profileForm = this.fb.nonNullable.group({
    name: [this.auth.user()?.name ?? '', [Validators.required, Validators.maxLength(120)]],
    email: [this.auth.user()?.email ?? '', [Validators.required, Validators.email]],
  });

  protected readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly deleteForm = this.fb.nonNullable.group({
    password: ['', Validators.required],
  });

  protected async saveProfile(): Promise<void> {
    if (this.profileForm.invalid) return;
    this.savingProfile.set(true);
    this.profileMessage.set(null);
    this.profileError.set(null);
    try {
      const { name, email } = this.profileForm.getRawValue();
      await this.auth.updateProfile(name, email);
      this.profileMessage.set('Datos guardados.');
    } catch (e) {
      this.profileError.set(apiErrorMessage(e));
    } finally {
      this.savingProfile.set(false);
    }
  }

  protected async changePassword(): Promise<void> {
    if (this.passwordForm.invalid) return;
    this.savingPassword.set(true);
    this.passwordMessage.set(null);
    this.passwordError.set(null);
    try {
      const { currentPassword, password } = this.passwordForm.getRawValue();
      await this.auth.changePassword(currentPassword, password);
      this.passwordForm.reset();
      this.passwordMessage.set('Contraseña actualizada.');
    } catch (e) {
      this.passwordError.set(apiErrorMessage(e));
    } finally {
      this.savingPassword.set(false);
    }
  }

  protected async deleteAccount(): Promise<void> {
    if (this.deleteForm.invalid) return;
    if (!confirm('¿Seguro que quieres borrar tu cuenta? Esta acción no se puede deshacer.')) {
      return;
    }
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.auth.deleteAccount(this.deleteForm.getRawValue().password);
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.deleteError.set(apiErrorMessage(e));
    } finally {
      this.deleting.set(false);
    }
  }
}
