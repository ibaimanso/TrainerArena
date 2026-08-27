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

interface RoundStandingsData {
  round: { roundNumber: number; status: string };
  standings: StandingRow[];
}

interface RoundSummary {
  roundNumber: number;
  phase: string;
  status: string;
}

/** Public standings (SPEC §12): table + top cut section + champion banner; auto-refresh. */
@Component({
  imports: [RouterLink, DecimalPipe, TournamentHeaderComponent],
  template: `
    <div class="space-y-6">
      <app-tournament-header [tournament]="tournament()" />

      @if (data(); as d) {
        @if (d.champion) {
          <div class="card flex items-center justify-center gap-2.5 p-4 text-center"
               role="status">
            <svg class="h-6 w-6 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
            <p class="text-lg font-semibold text-stone-900 dark:text-stone-100">Campeón: {{ d.champion.name }}</p>
          </div>
        }

        @if (d.topCut.length > 0) {
          <section class="card" aria-labelledby="titulo-top-cut">
            <h2 id="titulo-top-cut" class="section-title mb-4">Top cut</h2>
            <div class="flex gap-6 overflow-x-auto pb-2">
              @for (round of d.topCut; track round.roundNumber) {
                <div class="min-w-44">
                  <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                    {{ cutRoundLabel(round.matches.length) }} (R{{ round.roundNumber }})
                  </h3>
                  <div class="space-y-2">
                    @for (m of round.matches; track m.bracketPosition) {
                      <div class="overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-800 text-sm">
                        <p class="border-b border-stone-100 dark:border-stone-800 px-2.5 py-1.5"
                           [class.font-bold]="m.winnerId !== null && m.winnerId === m.playerA?.id"
                           [class.text-stone-900 dark:text-stone-100]="m.winnerId !== null && m.winnerId === m.playerA?.id">
                          {{ m.playerA?.name ?? '—' }}
                        </p>
                        <p class="px-2.5 py-1.5"
                           [class.font-bold]="m.winnerId !== null && m.winnerId === m.playerB?.id"
                           [class.text-stone-900 dark:text-stone-100]="m.winnerId !== null && m.winnerId === m.playerB?.id">
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

        @if (isLeague() && swissRoundNumbers().length > 0) {
          <nav aria-label="Clasificaciones de la liga">
            <div class="flex flex-wrap gap-1.5">
              <button type="button" (click)="selectView('general')"
                      [class]="view() === 'general' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'">
                General
              </button>
              @for (n of swissRoundNumbers(); track n) {
                <button type="button" (click)="selectView(n)"
                        [class]="view() === n ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'">
                  Jornada {{ n }}
                </button>
              }
            </div>
          </nav>
        }

        <section aria-label="Tabla de clasificación">
          @if (view() !== 'general') {
            <h2 class="section-title mb-3">Clasificación de la jornada {{ view() }}</h2>
          }
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Jugador</th>
                  <th scope="col">TCG Live</th>
                  <th scope="col" class="text-right">Puntos</th>
                  <th scope="col" class="text-right">W-L-D</th>
                  <th scope="col" class="text-right">OWP %</th>
                  <th scope="col" class="text-right">OOWP %</th>
                  @if (canSeeDecklists()) {
                    <th scope="col" class="text-right">Lista</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.playerId) {
                  <tr [class.text-stone-400 dark:text-stone-500]="row.dropped"
                      [class.bg-stone-100/60]="highlightTopCut(row)">
                    <td class="font-mono font-medium tabular-nums">{{ row.position }}</td>
                    <td class="font-medium" [class.text-stone-400 dark:text-stone-500]="row.dropped">
                      {{ row.playerName }}
                      @if (row.dropped) { <span class="text-xs font-normal">(retirado)</span> }
                      @if (highlightTopCut(row)) {
                        <span class="badge-brand ml-1.5">Top {{ tournament()?.topCutSize }}</span>
                      }
                    </td>
                    <td class="text-stone-500 dark:text-stone-400">{{ row.tcgLiveUsername }}</td>
                    <td class="text-right font-mono font-semibold tabular-nums">{{ row.points }}</td>
                    <td class="text-right font-mono tabular-nums">{{ row.wins }}-{{ row.losses }}-{{ row.draws }}</td>
                    <td class="text-right font-mono tabular-nums">{{ row.owp * 100 | number: '1.2-2' }}</td>
                    <td class="text-right font-mono tabular-nums">{{ row.oowp * 100 | number: '1.2-2' }}</td>
                    @if (canSeeDecklists()) {
                      <td class="text-right">
                        <a [routerLink]="['/torneo', slug(), 'jugador', row.playerId, 'lista']" class="link text-xs">
                          Ver lista
                        </a>
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr>
                    <td [attr.colspan]="canSeeDecklists() ? 8 : 7"
                        class="py-8 text-center text-stone-500 dark:text-stone-400">
                      Sin clasificación todavía.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (view() === 'general' && (tournament()?.topCutSize ?? 0) > 0 && d.standings.length > 0) {
            <p class="mt-2 text-xs text-stone-500 dark:text-stone-400">
              Las posiciones marcadas con «Top {{ tournament()?.topCutSize }}» clasifican al top cut.
            </p>
          }
        </section>
      } @else if (notFound()) {
        <div class="empty-state">
          <svg class="h-10 w-10 text-stone-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3M8 11h6" />
          </svg>
          <h1 class="text-lg font-bold text-stone-900 dark:text-stone-100">Torneo no encontrado</h1>
          <a routerLink="/" class="btn-secondary mt-2">Volver a los torneos</a>
        </div>
      } @else {
        <div class="table-wrap space-y-3 p-5" aria-label="Cargando clasificación">
          <div class="skeleton h-5 w-full"></div>
          <div class="skeleton h-5 w-full"></div>
          <div class="skeleton h-5 w-2/3"></div>
        </div>
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
  /** 'general' or a jornada (round) number, league format only. */
  protected readonly view = signal<'general' | number>('general');
  protected readonly roundData = signal<RoundStandingsData | null>(null);
  private readonly roundsList = signal<RoundSummary[]>([]);
  private unsubscribe: (() => void) | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;

  protected isLeague(): boolean {
    return this.tournament()?.format === 'league';
  }

  /** Swiss rounds already started or finished: those have a jornada standing. */
  protected swissRoundNumbers(): number[] {
    return this.roundsList()
      .filter((r) => r.phase === 'swiss' && r.status !== 'pending')
      .map((r) => r.roundNumber);
  }

  protected canSeeDecklists(): boolean {
    const t = this.tournament();
    return (
      t?.showOpponentDecklists === true &&
      (t.status === 'in_progress' || t.status === 'finished' ||
        this.data()?.tournamentStatus === 'in_progress' ||
        this.data()?.tournamentStatus === 'finished')
    );
  }

  protected rows(): StandingRow[] {
    if (this.view() === 'general') return this.data()?.standings ?? [];
    return this.roundData()?.standings ?? [];
  }

  protected highlightTopCut(row: StandingRow): boolean {
    return (
      this.view() === 'general' &&
      !row.dropped &&
      (this.tournament()?.topCutSize ?? 0) >= row.position
    );
  }

  protected async selectView(view: 'general' | number): Promise<void> {
    this.view.set(view);
    if (view !== 'general') {
      this.roundData.set(null);
      this.roundData.set(
        await firstValueFrom(
          this.http.get<RoundStandingsData>(
            `/api/tournaments/${this.slug()}/rounds/${view}/standings`
          )
        )
      );
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      const detail = await this.tournaments.detail(this.slug());
      this.tournament.set(detail.tournament);
      await this.reload();
      if (detail.tournament.format === 'league') {
        const res = await firstValueFrom(
          this.http.get<{ rounds: RoundSummary[] }>(`/api/tournaments/${this.slug()}/rounds`)
        );
        this.roundsList.set(res.rounds);
      }
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
