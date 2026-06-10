import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';

@Component({
  imports: [ReactiveFormsModule],
  template: `
    <div class="mx-auto max-w-xl space-y-6">
      <h1 class="text-2xl font-bold">Mi perfil</h1>

      <form [formGroup]="profileForm" (ngSubmit)="saveProfile()" class="space-y-4 rounded-lg bg-white p-6 shadow">
        <h2 class="font-semibold">Datos de la cuenta</h2>
        @if (profileMessage()) {
          <p class="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{{ profileMessage() }}</p>
        }
        @if (profileError()) {
          <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ profileError() }}</p>
        }
        <div>
          <label for="name" class="mb-1 block text-sm font-medium">Nombre</label>
          <input id="name" type="text" formControlName="name" maxlength="120"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
        </div>
        <div>
          <label for="email" class="mb-1 block text-sm font-medium">Email</label>
          <input id="email" type="email" formControlName="email"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
          <p class="mt-1 text-xs text-zinc-500">Si cambias el email tendrás que verificarlo de nuevo.</p>
        </div>
        <button type="submit" [disabled]="profileForm.invalid || savingProfile()"
                class="rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
          Guardar cambios
        </button>
      </form>

      <form [formGroup]="passwordForm" (ngSubmit)="changePassword()" class="space-y-4 rounded-lg bg-white p-6 shadow">
        <h2 class="font-semibold">Cambiar contraseña</h2>
        @if (passwordMessage()) {
          <p class="rounded bg-green-50 px-3 py-2 text-sm text-green-800">{{ passwordMessage() }}</p>
        }
        @if (passwordError()) {
          <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ passwordError() }}</p>
        }
        <div>
          <label for="currentPassword" class="mb-1 block text-sm font-medium">Contraseña actual</label>
          <input id="currentPassword" type="password" formControlName="currentPassword" autocomplete="current-password"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
        </div>
        <div>
          <label for="newPassword" class="mb-1 block text-sm font-medium">Nueva contraseña</label>
          <input id="newPassword" type="password" formControlName="password" autocomplete="new-password"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
        </div>
        <button type="submit" [disabled]="passwordForm.invalid || savingPassword()"
                class="rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
          Cambiar contraseña
        </button>
      </form>

      <form [formGroup]="deleteForm" (ngSubmit)="deleteAccount()" class="space-y-4 rounded-lg border border-red-200 bg-white p-6 shadow">
        <h2 class="font-semibold text-red-700">Borrar cuenta</h2>
        <p class="text-sm text-zinc-600">
          Esta acción es permanente: se eliminarán tus inscripciones y datos. Introduce tu
          contraseña para confirmar.
        </p>
        @if (deleteError()) {
          <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ deleteError() }}</p>
        }
        <div>
          <label for="deletePassword" class="mb-1 block text-sm font-medium">Contraseña</label>
          <input id="deletePassword" type="password" formControlName="password" autocomplete="current-password"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-red-500 focus:outline-none" />
        </div>
        <button type="submit" [disabled]="deleteForm.invalid || deleting()"
                class="rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-500 disabled:opacity-50">
          Borrar mi cuenta
        </button>
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
