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
      <header class="card sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <h1 class="page-title">{{ t.name }}</h1>
            <p class="mt-1.5 flex items-center gap-1.5 text-sm text-stone-500 dark:text-stone-400">
              <svg class="h-4 w-4 shrink-0 text-stone-400 dark:text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              {{ t.startAt | date: "EEEE d 'de' MMMM 'de' y, HH:mm" }}
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <span [class]="t.status === 'registration_open' ? 'badge-success'
                         : t.status === 'in_progress' ? 'badge-brand'
                         : t.status === 'cancelled' ? 'badge-danger'
                         : t.status === 'registration_closed' ? 'badge-warning'
                         : 'badge-neutral'">
              {{ statusLabel(t) }}
            </span>
            <span class="badge-brand">{{ fee(t) }}</span>
          </div>
        </div>

        <div class="mt-5">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="text-stone-700 dark:text-stone-300">
              <span class="font-mono font-semibold tabular-nums">{{ t.activeCount }} / {{ t.maxPlayers }}</span>
              inscritos
            </span>
          </div>
          <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700" role="progressbar"
               aria-label="Plazas ocupadas" aria-valuemin="0"
               [attr.aria-valuenow]="t.activeCount" [attr.aria-valuemax]="t.maxPlayers">
            <div class="h-full rounded-full bg-stone-900 transition-all"
                 [style.width.%]="(100 * t.activeCount) / t.maxPlayers"></div>
          </div>
        </div>
      </header>

      <nav class="mt-4 flex gap-1 overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-800 p-1.5 shadow-sm"
           aria-label="Secciones del torneo">
        <a [routerLink]="['/torneo', t.slug]" routerLinkActive ariaCurrentWhenActive="page"
           [routerLinkActiveOptions]="{ exact: true }"
           class="whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium text-stone-600 dark:text-stone-400 transition-colors hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 aria-[current=page]:bg-stone-900 aria-[current=page]:text-white aria-[current=page]:hover:bg-stone-900 aria-[current=page]:hover:text-white">Torneo</a>
        <a [routerLink]="['/torneo', t.slug, 'clasificacion']" routerLinkActive ariaCurrentWhenActive="page"
           class="whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium text-stone-600 dark:text-stone-400 transition-colors hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 aria-[current=page]:bg-stone-900 aria-[current=page]:text-white aria-[current=page]:hover:bg-stone-900 aria-[current=page]:hover:text-white">Clasificación</a>
        <a [routerLink]="['/torneo', t.slug, 'ronda-actual']" routerLinkActive ariaCurrentWhenActive="page"
           class="whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium text-stone-600 dark:text-stone-400 transition-colors hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 aria-[current=page]:bg-stone-900 aria-[current=page]:text-white aria-[current=page]:hover:bg-stone-900 aria-[current=page]:hover:text-white">Ronda actual</a>
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
