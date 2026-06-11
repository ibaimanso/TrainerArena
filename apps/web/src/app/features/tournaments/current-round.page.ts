import { Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { events } from '@apptorneos/shared';
import { RealtimeService } from '../../core/realtime.service';
import { ServerTimeService } from '../../core/server-time.service';
import { TournamentsService, type TournamentDetail } from '../../core/tournaments.service';
import { TournamentHeaderComponent } from './tournament-header.component';

interface CurrentRoundData {
  tournamentStatus: string;
  round: {
    roundNumber: number;
    phase: string;
    status: string;
    endsAt: string | null;
  } | null;
  serverNow: string;
}

/** Public current round (SPEC §12): giant mm:ss timer or "Sin límite de tiempo". */
@Component({
  imports: [RouterLink, TournamentHeaderComponent],
  template: `
    <div class="space-y-6">
      <app-tournament-header [tournament]="tournament()" />

      @if (data(); as d) {
        <section class="card p-8 text-center sm:p-10" aria-label="Ronda actual">
          @if (d.tournamentStatus === 'finished') {
            <svg class="mx-auto h-10 w-10 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
            <h2 class="mt-3 text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Torneo terminado</h2>
            <a [routerLink]="['/torneo', slug(), 'clasificacion']" class="btn-primary mt-5">
              Ver clasificación final
            </a>
          } @else if (d.round === null) {
            <svg class="mx-auto h-10 w-10 text-stone-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <h2 class="mt-3 text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">No hay ronda en marcha</h2>
            <p class="mt-2 text-sm text-stone-500 dark:text-stone-400">Vuelve cuando el torneo arranque la siguiente ronda.</p>
          } @else {
            <p class="text-sm font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
              {{ d.round.phase === 'swiss' ? 'Ronda suiza' : 'Top cut' }} {{ d.round.roundNumber }}
              · {{ statusLabel(d.round.status) }}
            </p>
            @if (d.round.status === 'active' && d.round.endsAt) {
              <p class="mt-4 font-mono text-7xl font-bold tabular-nums sm:text-8xl"
                 [class]="remainingMs() < 120000 ? 'text-red-600 dark:text-red-400' : 'text-stone-800 dark:text-stone-200'"
                 role="timer" aria-label="Tiempo restante de la ronda">
                {{ timer() }}
              </p>
              <p class="mt-1 text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500">Tiempo restante</p>
            } @else if (d.round.phase === 'top_cut' && d.round.status === 'active') {
              <p class="mt-4 text-3xl font-bold text-stone-700 dark:text-stone-300">Sin límite de tiempo</p>
              <p class="mt-1 text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500">Se juega a finalizar</p>
            }
            <div class="mt-8">
              <a [routerLink]="['/torneo', slug(), 'pareos', 'ronda', d.round.roundNumber]" class="btn-primary">
                Ver pareos de esta ronda
              </a>
            </div>
          }
        </section>
      } @else {
        <div class="card space-y-4 p-8 text-center" aria-label="Cargando ronda actual">
          <div class="skeleton mx-auto h-4 w-40"></div>
          <div class="skeleton mx-auto h-20 w-56"></div>
          <div class="skeleton mx-auto h-9 w-44"></div>
        </div>
      }
    </div>
  `,
})
export default class CurrentRoundPage implements OnInit, OnDestroy {
  readonly slug = input.required<string>();
  private readonly http = inject(HttpClient);
  private readonly tournaments = inject(TournamentsService);
  private readonly realtime = inject(RealtimeService);
  private readonly serverTime = inject(ServerTimeService);

  protected readonly tournament = signal<TournamentDetail | null>(null);
  protected readonly data = signal<CurrentRoundData | null>(null);
  protected readonly remainingMs = signal(0);
  protected readonly timer = signal('--:--');
  private tick: ReturnType<typeof setInterval> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;

  async ngOnInit(): Promise<void> {
    try {
      const detail = await this.tournaments.detail(this.slug());
      this.tournament.set(detail.tournament);
      await this.reload();
      this.tick = setInterval(() => this.updateTimer(), 1000);
      const refresh = () => void this.reload();
      this.unsubscribe = await this.realtime.subscribe(
        `public.tournament.${detail.tournament.publicId}`,
        {
          [events.roundStarted]: refresh,
          [events.roundFinished]: refresh,
          [events.tournamentFinished]: refresh,
        }
      );
      this.poll = setInterval(() => {
        if (!this.realtime.connected()) void this.reload();
      }, 15000);
    } catch {
      // header shows nothing; page degrades
    }
  }

  ngOnDestroy(): void {
    if (this.tick) clearInterval(this.tick);
    if (this.poll) clearInterval(this.poll);
    this.unsubscribe?.();
  }

  private async reload(): Promise<void> {
    const data = await firstValueFrom(
      this.http.get<CurrentRoundData>(`/api/tournaments/${this.slug()}/current-round`)
    );
    this.data.set(data);
    this.updateTimer();
  }

  private updateTimer(): void {
    const endsAt = this.data()?.round?.endsAt;
    if (!endsAt) return;
    const remaining = this.serverTime.remainingMs(endsAt);
    this.remainingMs.set(remaining);
    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    this.timer.set(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
  }

  protected statusLabel(status: string): string {
    return { pending: 'pendiente', active: 'en curso', finished: 'cerrada' }[status] ?? status;
  }
}
