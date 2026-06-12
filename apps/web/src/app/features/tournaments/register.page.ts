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
      <h1 class="page-title mb-2 text-center">Inscripción al torneo</h1>
      <p class="mb-6 text-center text-sm text-stone-500 dark:text-stone-400">
        Completa tus datos de jugador para reservar tu plaza.
      </p>

      <form [formGroup]="form" (ngSubmit)="submit()" class="card space-y-5">
        @if (error()) {
          <p class="alert-error" role="alert">{{ error() }}</p>
        }
        <p class="alert-info" role="status">
          Si el torneo tiene cuota de inscripción, tu plaza quedará reservada y el organizador
          la confirmará cuando reciba tu pago (verás las instrucciones de pago al enviar la
          solicitud).
        </p>
        <div>
          <label for="fullName" class="label">Nombre completo</label>
          <input id="fullName" type="text" formControlName="fullName" maxlength="120"
                 required autocomplete="name" class="input" />
        </div>
        <div>
          <label for="tcg" class="label">Usuario de Pokémon TCG Live</label>
          <input id="tcg" type="text" formControlName="tcgLiveUsername" maxlength="60"
                 required class="input" />
          <p class="hint">Tus rivales te buscarán con este nombre dentro de TCG Live.</p>
        </div>
        <div>
          <label for="email" class="label">Email</label>
          <input id="email" type="email" formControlName="email"
                 required autocomplete="email" class="input" />
          <p class="hint">Recibirás la confirmación en este email.</p>
        </div>
        <div>
          <label for="phone" class="label">Teléfono (opcional)</label>
          <input id="phone" type="tel" formControlName="phone" maxlength="30"
                 autocomplete="tel" class="input" />
        </div>
        <div class="flex gap-2 pt-1">
          <button type="submit" [disabled]="form.invalid || saving()" class="btn-primary flex-1">
            {{ saving() ? 'Inscribiendo…' : 'Confirmar inscripción' }}
          </button>
          <a [routerLink]="['/torneo', slug()]" class="btn-secondary">Cancelar</a>
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
      await this.player.register(this.slug(), {
        fullName: v.fullName,
        tcgLiveUsername: v.tcgLiveUsername,
        email: v.email,
        phone: v.phone || undefined,
      });
      await this.router.navigate(['/torneo', this.slug()], { queryParams: { inscrito: 1 } });
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
