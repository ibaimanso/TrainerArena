import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { formatFee } from '@apptorneos/shared';
import type { TournamentDetail, TournamentSummary } from '../../core/tournaments.service';

export const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  registration_open: 'Inscripciones abiertas',
  registration_closed: 'Inscripciones cerradas',
  in_progress: 'En curso',
  finished: 'Terminado',
  cancelled: 'Cancelado',
};

/** Shared public header + sub-navigation (Torneo · Clasificación · Ronda actual). */
@Component({
  selector: 'app-tournament-header',
  imports: [RouterLink, RouterLinkActive, DatePipe],
  template: `
    @if (tournament(); as t) {
      <header class="rounded-lg bg-white p-6 shadow">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold">{{ t.name }}</h1>
            <p class="mt-1 text-sm text-zinc-500">
              {{ t.startAt | date: "EEEE d 'de' MMMM 'de' y, HH:mm" }}
            </p>
          </div>
          <span class="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
            {{ fee(t) }}
          </span>
        </div>

        <div class="mt-4">
          <div class="flex items-center justify-between text-sm">
            <span>{{ t.activeCount }} / {{ t.maxPlayers }} inscritos</span>
            <span class="text-zinc-500">{{ statusLabel(t) }}</span>
          </div>
          <div class="mt-1 h-2 overflow-hidden rounded-full bg-zinc-200">
            <div class="h-full bg-indigo-600"
                 [style.width.%]="(100 * t.activeCount) / t.maxPlayers"></div>
          </div>
        </div>
      </header>

      <nav class="mt-4 flex gap-1 overflow-x-auto rounded-lg bg-white p-1 shadow">
        <a [routerLink]="['/torneo', t.slug]" routerLinkActive="bg-indigo-600 text-white"
           [routerLinkActiveOptions]="{ exact: true }"
           class="rounded px-4 py-2 text-sm font-medium hover:bg-indigo-50">Torneo</a>
        <a [routerLink]="['/torneo', t.slug, 'clasificacion']" routerLinkActive="bg-indigo-600 text-white"
           class="rounded px-4 py-2 text-sm font-medium hover:bg-indigo-50">Clasificación</a>
        <a [routerLink]="['/torneo', t.slug, 'ronda-actual']" routerLinkActive="bg-indigo-600 text-white"
           class="rounded px-4 py-2 text-sm font-medium hover:bg-indigo-50">Ronda actual</a>
      </nav>
    }
  `,
})
export class TournamentHeaderComponent {
  readonly tournament = input.required<TournamentDetail | TournamentSummary | null>();

  protected fee(t: TournamentSummary): string {
    return formatFee(t.feeAmount, t.feeCurrency);
  }

  protected statusLabel(t: TournamentSummary): string {
    return TOURNAMENT_STATUS_LABELS[t.status] ?? t.status;
  }
}
