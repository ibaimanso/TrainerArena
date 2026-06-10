import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { PlayerService } from '../../core/player.service';

/** Registration form (SPEC §8.2): full_name, tcg_live_username, email (prefilled), phone. */
@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-md">
      <h1 class="mb-6 text-2xl font-bold">Inscripción</h1>

      <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4 rounded-lg bg-white p-6 shadow">
        @if (error()) {
          <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
        }
        <div>
          <label for="fullName" class="mb-1 block text-sm font-medium">Nombre completo</label>
          <input id="fullName" type="text" formControlName="fullName" maxlength="120"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
        </div>
        <div>
          <label for="tcg" class="mb-1 block text-sm font-medium">Usuario de Pokémon TCG Live</label>
          <input id="tcg" type="text" formControlName="tcgLiveUsername" maxlength="60"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
        </div>
        <div>
          <label for="email" class="mb-1 block text-sm font-medium">Email</label>
          <input id="email" type="email" formControlName="email"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
          <p class="mt-1 text-xs text-zinc-500">Recibirás la confirmación en este email.</p>
        </div>
        <div>
          <label for="phone" class="mb-1 block text-sm font-medium">Teléfono (opcional)</label>
          <input id="phone" type="tel" formControlName="phone" maxlength="30"
                 class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
        </div>
        <div class="flex gap-2">
          <button type="submit" [disabled]="form.invalid || saving()"
                  class="flex-1 rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {{ saving() ? 'Inscribiendo…' : 'Confirmar inscripción' }}
          </button>
          <a [routerLink]="['/torneo', slug()]"
             class="rounded border border-zinc-300 px-4 py-2 text-center hover:bg-zinc-50">Cancelar</a>
        </div>
      </form>
    </div>
  `,
})
export default class RegisterTournamentPage implements OnInit {
  readonly slug = input.required<string>();
  private readonly fb = inject(FormBuilder);
  private readonly player = inject(PlayerService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(120)]],
    tcgLiveUsername: ['', [Validators.required, Validators.maxLength(60)]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
  });

  async ngOnInit(): Promise<void> {
    await this.auth.loadOnce();
    const user = this.auth.user();
    if (user) {
      this.form.patchValue({ fullName: user.name, email: user.email });
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const v = this.form.getRawValue();
      const res = await this.player.register(this.slug(), {
        fullName: v.fullName,
        tcgLiveUsername: v.tcgLiveUsername,
        email: v.email,
        phone: v.phone || undefined,
      });
      if (res.approvalUrl) {
        // Paid tournament: continue in PayPal.
        window.location.href = res.approvalUrl;
        return;
      }
      await this.router.navigate(['/torneo', this.slug()], { queryParams: { inscrito: 1 } });
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
