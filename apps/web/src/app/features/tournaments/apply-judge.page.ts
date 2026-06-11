import { Component, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { PlayerService } from '../../core/player.service';

/** Judge application confirmation (SPEC §10.1). */
@Component({
  imports: [RouterLink],
  template: `
    <div class="mx-auto max-w-md">
      <h1 class="page-title mb-2 text-center">Solicitar ser juez</h1>
      <p class="mb-6 text-center text-sm text-stone-500 dark:text-stone-400">
        Confirma tu solicitud para arbitrar este torneo.
      </p>

      <div class="card space-y-5">
        @if (error()) {
          <p class="alert-error" role="alert">{{ error() }}</p>
        }
        <p class="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
          Vas a solicitar arbitrar este torneo. El administrador revisará tu solicitud; si te
          aprueba tendrás acceso a las herramientas de juez (llamadas, disputas y decklists)
          de este torneo.
        </p>
        <div class="flex gap-2">
          <button type="button" (click)="apply()" [disabled]="sending()" class="btn-primary flex-1">
            {{ sending() ? 'Enviando…' : 'Enviar solicitud' }}
          </button>
          <a [routerLink]="['/torneo', slug()]" class="btn-secondary">Cancelar</a>
        </div>
      </div>
    </div>
  `,
})
export default class ApplyJudgePage {
  readonly slug = input.required<string>();
  private readonly player = inject(PlayerService);
  private readonly router = inject(Router);

  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async apply(): Promise<void> {
    this.sending.set(true);
    this.error.set(null);
    try {
      await this.player.applyAsJudge(this.slug());
      await this.router.navigate(['/torneo', this.slug()], { queryParams: { juez: 'pendiente' } });
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.sending.set(false);
    }
  }
}
