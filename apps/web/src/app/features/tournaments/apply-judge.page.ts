import { Component, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { PlayerService } from '../../core/player.service';

/** Judge application confirmation (SPEC §10.1). */
@Component({
  imports: [RouterLink],
  template: `
    <div class="mx-auto max-w-md">
      <h1 class="mb-6 text-2xl font-bold">Solicitar ser juez</h1>
      <div class="space-y-4 rounded-lg bg-white p-6 shadow">
        @if (error()) {
          <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
        }
        <p class="text-sm text-zinc-600">
          Vas a solicitar arbitrar este torneo. El administrador revisará tu solicitud; si te
          aprueba tendrás acceso a las herramientas de juez (llamadas, disputas y decklists)
          de este torneo.
        </p>
        <div class="flex gap-2">
          <button type="button" (click)="apply()" [disabled]="sending()"
                  class="flex-1 rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {{ sending() ? 'Enviando…' : 'Enviar solicitud' }}
          </button>
          <a [routerLink]="['/torneo', slug()]"
             class="rounded border border-zinc-300 px-4 py-2 text-center hover:bg-zinc-50">Cancelar</a>
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
