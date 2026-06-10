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
    <div class="space-y-4">
      <app-tournament-header [tournament]="tournament()" />

      @if (data(); as d) {
        <section class="rounded-lg bg-white p-8 text-center shadow">
          @if (d.tournamentStatus === 'finished') {
            <h1 class="text-2xl font-bold">Torneo terminado</h1>
            <a [routerLink]="['/torneo', slug(), 'clasificacion']"
               class="mt-3 inline-block text-indigo-600 hover:underline">Ver clasificación final</a>
          } @else if (d.round === null) {
            <h1 class="text-2xl font-bold">No hay ronda en marcha</h1>
            <p class="mt-2 text-sm text-zinc-500">Vuelve cuando el torneo arranque la siguiente ronda.</p>
          } @else {
            <p class="text-sm uppercase tracking-wide text-zinc-500">
              {{ d.round.phase === 'swiss' ? 'Ronda suiza' : 'Top cut' }} {{ d.round.roundNumber }}
              · {{ statusLabel(d.round.status) }}
            </p>
            @if (d.round.status === 'active' && d.round.endsAt) {
              <p class="mt-4 font-mono text-7xl font-bold sm:text-8xl"
                 [class]="remainingMs() < 120000 ? 'text-red-600' : 'text-zinc-800'">
                {{ timer() }}
              </p>
              <p class="mt-1 text-sm text-zinc-400">tiempo restante</p>
            } @else if (d.round.phase === 'top_cut' && d.round.status === 'active') {
              <p class="mt-4 text-3xl font-bold text-zinc-700">Sin límite de tiempo</p>
              <p class="mt-1 text-sm text-zinc-400">se juega a finalizar</p>
            }
            <a [routerLink]="['/torneo', slug(), 'pareos', 'ronda', d.round.roundNumber]"
               class="mt-6 inline-block rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
              Ver pareos de esta ronda
            </a>
          }
        </section>
      } @else {
        <p class="text-center text-sm text-zinc-500">Cargando…</p>
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
