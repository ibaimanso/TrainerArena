import { DecimalPipe } from '@angular/common';
import { Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { events } from '@apptorneos/shared';
import { RealtimeService } from '../../core/realtime.service';
import { TournamentsService, type TournamentDetail } from '../../core/tournaments.service';
import { TournamentHeaderComponent } from './tournament-header.component';

interface StandingRow {
  position: number;
  playerId: number;
  playerName: string;
  tcgLiveUsername: string;
  dropped: boolean;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  owp: number;
  oowp: number;
}

interface CutMatch {
  bracketPosition: number;
  playerA: { id: number; name: string } | null;
  playerB: { id: number; name: string } | null;
  isBye: boolean;
  winnerId: number | null;
}

interface StandingsData {
  tournamentStatus: string;
  champion: { id: number; name: string } | null;
  standings: StandingRow[];
  topCut: Array<{ roundNumber: number; status: string; matches: CutMatch[] }>;
}

/** Public standings (SPEC §12): table + top cut section + champion banner; auto-refresh. */
@Component({
  imports: [RouterLink, DecimalPipe, TournamentHeaderComponent],
  template: `
    <div class="space-y-4">
      <app-tournament-header [tournament]="tournament()" />

      @if (data(); as d) {
        @if (d.champion) {
          <div class="rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 p-4 text-center shadow">
            <p class="text-lg font-bold text-white">🏆 Campeón: {{ d.champion.name }}</p>
          </div>
        }

        @if (d.topCut.length > 0) {
          <section class="rounded-lg bg-white p-4 shadow">
            <h2 class="mb-3 font-semibold">Top cut</h2>
            <div class="flex gap-6 overflow-x-auto pb-2">
              @for (round of d.topCut; track round.roundNumber) {
                <div class="min-w-44">
                  <h3 class="mb-2 text-xs font-semibold uppercase text-zinc-500">
                    {{ cutRoundLabel(round.matches.length) }} (R{{ round.roundNumber }})
                  </h3>
                  <div class="space-y-2">
                    @for (m of round.matches; track m.bracketPosition) {
                      <div class="rounded border border-zinc-200 text-sm">
                        <p class="border-b border-zinc-100 px-2 py-1"
                           [class.font-bold]="m.winnerId !== null && m.winnerId === m.playerA?.id">
                          {{ m.playerA?.name ?? '—' }}
                        </p>
                        <p class="px-2 py-1"
                           [class.font-bold]="m.winnerId !== null && m.winnerId === m.playerB?.id">
                          {{ m.isBye ? 'BYE' : (m.playerB?.name ?? '—') }}
                        </p>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          </section>
        }

        <section class="overflow-x-auto rounded-lg bg-white shadow">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-zinc-200 text-xs uppercase text-zinc-500">
              <tr>
                <th class="px-3 py-3">#</th>
                <th class="px-3 py-3">Jugador</th>
                <th class="px-3 py-3">TCG Live</th>
                <th class="px-3 py-3 text-right">Puntos</th>
                <th class="px-3 py-3 text-right">W-L-D</th>
                <th class="px-3 py-3 text-right">OWP %</th>
                <th class="px-3 py-3 text-right">OOWP %</th>
              </tr>
            </thead>
            <tbody>
              @for (row of d.standings; track row.playerId) {
                <tr class="border-b border-zinc-100" [class.text-zinc-400]="row.dropped">
                  <td class="px-3 py-2 font-medium">{{ row.position }}</td>
                  <td class="px-3 py-2">
                    {{ row.playerName }}
                    @if (row.dropped) { <span class="text-xs">(retirado)</span> }
                  </td>
                  <td class="px-3 py-2 text-zinc-500">{{ row.tcgLiveUsername }}</td>
                  <td class="px-3 py-2 text-right font-semibold">{{ row.points }}</td>
                  <td class="px-3 py-2 text-right">{{ row.wins }}-{{ row.losses }}-{{ row.draws }}</td>
                  <td class="px-3 py-2 text-right">{{ row.owp * 100 | number: '1.2-2' }}</td>
                  <td class="px-3 py-2 text-right">{{ row.oowp * 100 | number: '1.2-2' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="px-3 py-6 text-center text-zinc-500">Sin clasificación todavía.</td></tr>
              }
            </tbody>
          </table>
        </section>
      } @else if (notFound()) {
        <div class="rounded-lg bg-white p-8 text-center shadow">
          <h1 class="text-xl font-bold">Torneo no encontrado</h1>
          <a routerLink="/" class="mt-3 inline-block text-indigo-600 hover:underline">Volver</a>
        </div>
      } @else {
        <p class="text-center text-sm text-zinc-500">Cargando clasificación…</p>
      }
    </div>
  `,
})
export default class StandingsPage implements OnInit, OnDestroy {
  readonly slug = input.required<string>();
  private readonly http = inject(HttpClient);
  private readonly tournaments = inject(TournamentsService);
  private readonly realtime = inject(RealtimeService);

  protected readonly tournament = signal<TournamentDetail | null>(null);
  protected readonly data = signal<StandingsData | null>(null);
  protected readonly notFound = signal(false);
  private unsubscribe: (() => void) | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;

  async ngOnInit(): Promise<void> {
    try {
      const detail = await this.tournaments.detail(this.slug());
      this.tournament.set(detail.tournament);
      await this.reload();
      const refresh = () => void this.reload();
      this.unsubscribe = await this.realtime.subscribe(
        `public.tournament.${detail.tournament.publicId}`,
        {
          [events.standingsUpdated]: refresh,
          [events.roundFinished]: refresh,
          [events.matchFinished]: refresh,
          [events.tournamentFinished]: refresh,
        }
      );
      this.poll = setInterval(() => {
        if (!this.realtime.connected()) void this.reload();
      }, 30000);
    } catch {
      this.notFound.set(true);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    if (this.poll) clearInterval(this.poll);
  }

  private async reload(): Promise<void> {
    this.data.set(
      await firstValueFrom(this.http.get<StandingsData>(`/api/tournaments/${this.slug()}/standings`))
    );
  }

  protected cutRoundLabel(matchCount: number): string {
    if (matchCount === 1) return 'Final';
    if (matchCount === 2) return 'Semifinales';
    if (matchCount === 4) return 'Cuartos';
    return `Top ${matchCount * 2}`;
  }
}
