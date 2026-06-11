import { Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { events } from '@apptorneos/shared';
import { RealtimeService } from '../../core/realtime.service';
import { TournamentsService, type TournamentDetail } from '../../core/tournaments.service';
import { TournamentHeaderComponent } from './tournament-header.component';

interface PairingRow {
  tableNumber: number;
  playerA: { id: number; name: string };
  playerB: { id: number; name: string } | null;
  isBye: boolean;
  status: string;
  result: string | null;
}

/** Public pairings of round N (SPEC §12): selector + table; 404 if missing. */
@Component({
  imports: [RouterLink, TournamentHeaderComponent],
  template: `
    <div class="space-y-6">
      <app-tournament-header [tournament]="tournament()" />

      @if (notFound()) {
        <div class="empty-state">
          <svg class="h-10 w-10 text-stone-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3M8 11h6" />
          </svg>
          <h2 class="text-lg font-bold text-stone-900 dark:text-stone-100">Ronda no encontrada</h2>
          <a [routerLink]="['/torneo', slug()]" class="btn-secondary mt-2">Volver al torneo</a>
        </div>
      } @else {
        @if (rounds().length > 0) {
          <nav class="flex flex-wrap gap-1 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-800 p-1.5 shadow-sm"
               aria-label="Rondas del torneo">
            @for (r of rounds(); track r.roundNumber) {
              <a [routerLink]="['/torneo', slug(), 'pareos', 'ronda', r.roundNumber]"
                 class="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                 [class]="r.roundNumber === roundNumber()
                   ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                   : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'"
                 [attr.aria-current]="r.roundNumber === roundNumber() ? 'page' : null">
                R{{ r.roundNumber }}{{ r.phase === 'top_cut' ? ' (cut)' : '' }}
              </a>
            }
          </nav>
        }

        <section aria-label="Pareos de la ronda">
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">Mesa</th>
                  <th scope="col">Jugador A</th>
                  <th scope="col">Jugador B</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                @for (m of matches(); track m.tableNumber) {
                  <tr>
                    <td class="font-mono font-medium tabular-nums">{{ m.tableNumber }}</td>
                    <td class="font-medium">{{ m.playerA.name }}</td>
                    <td [class.text-stone-500 dark:text-stone-400]="m.isBye || !m.playerB" [class.font-medium]="!m.isBye && m.playerB">
                      {{ m.isBye ? 'BYE' : (m.playerB?.name ?? '—') }}
                    </td>
                    <td>
                      <span [class]="m.result === null
                              ? (m.status === 'disputed' ? 'badge-warning' : 'badge-neutral')
                              : 'badge-success'">
                        {{ resultLabel(m) }}
                      </span>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="4" class="py-8 text-center text-stone-500 dark:text-stone-400">Sin mesas en esta ronda.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
})
export default class PairingsPage implements OnInit, OnDestroy {
  readonly slug = input.required<string>();
  readonly n = input.required<string>();
  private readonly http = inject(HttpClient);
  private readonly tournaments = inject(TournamentsService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);

  protected readonly tournament = signal<TournamentDetail | null>(null);
  protected readonly rounds = signal<Array<{ roundNumber: number; phase: string; status: string }>>([]);
  protected readonly matches = signal<PairingRow[]>([]);
  protected readonly notFound = signal(false);
  private unsubscribe: (() => void) | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;

  protected roundNumber(): number {
    return Number(this.n());
  }

  async ngOnInit(): Promise<void> {
    try {
      const detail = await this.tournaments.detail(this.slug());
      this.tournament.set(detail.tournament);
      const roundsRes = await firstValueFrom(
        this.http.get<{ rounds: Array<{ roundNumber: number; phase: string; status: string }> }>(
          `/api/tournaments/${this.slug()}/rounds`
        )
      );
      this.rounds.set(roundsRes.rounds);
      await this.reload();
      const refresh = () => void this.reload();
      this.unsubscribe = await this.realtime.subscribe(
        `public.tournament.${detail.tournament.publicId}`,
        {
          [events.matchFinished]: refresh,
          [events.matchForfeited]: refresh,
          [events.pairingsPublished]: refresh,
        }
      );
      this.poll = setInterval(() => {
        if (!this.realtime.connected()) void this.reload();
      }, 30000);
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 404) this.notFound.set(true);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    if (this.poll) clearInterval(this.poll);
  }

  private async reload(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ matches: PairingRow[] }>(
          `/api/tournaments/${this.slug()}/rounds/${this.roundNumber()}/pairings`
        )
      );
      this.matches.set(res.matches);
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 404) this.notFound.set(true);
    }
  }

  protected resultLabel(m: PairingRow): string {
    if (m.result === null) return m.status === 'disputed' ? 'En disputa' : 'Pendiente';
    const labels: Record<string, string> = {
      a_wins: 'Victoria A',
      b_wins: 'Victoria B',
      draw: 'Empate',
      bye: 'BYE',
      forfeit_a: 'Forfeit A',
      forfeit_b: 'Forfeit B',
      forfeit_both: 'Doble forfeit',
    };
    return labels[m.result] ?? m.result;
  }
}
