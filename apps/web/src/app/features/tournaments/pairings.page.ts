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
    <div class="space-y-4">
      <app-tournament-header [tournament]="tournament()" />

      @if (notFound()) {
        <div class="rounded-lg bg-white p-8 text-center shadow">
          <h1 class="text-xl font-bold">Ronda no encontrada</h1>
          <a [routerLink]="['/torneo', slug()]" class="mt-3 inline-block text-indigo-600 hover:underline">
            Volver al torneo
          </a>
        </div>
      } @else {
        @if (rounds().length > 0) {
          <nav class="flex flex-wrap gap-1 rounded-lg bg-white p-2 shadow">
            @for (r of rounds(); track r.roundNumber) {
              <a [routerLink]="['/torneo', slug(), 'pareos', 'ronda', r.roundNumber]"
                 class="rounded px-3 py-1.5 text-sm font-medium"
                 [class]="r.roundNumber === roundNumber() ? 'bg-indigo-600 text-white' : 'hover:bg-indigo-50'">
                R{{ r.roundNumber }}{{ r.phase === 'top_cut' ? ' (cut)' : '' }}
              </a>
            }
          </nav>
        }

        <section class="overflow-x-auto rounded-lg bg-white shadow">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-zinc-200 text-xs uppercase text-zinc-500">
              <tr>
                <th class="px-4 py-3">Mesa</th>
                <th class="px-4 py-3">Jugador A</th>
                <th class="px-4 py-3">Jugador B</th>
                <th class="px-4 py-3">Resultado</th>
              </tr>
            </thead>
            <tbody>
              @for (m of matches(); track m.tableNumber) {
                <tr class="border-b border-zinc-100">
                  <td class="px-4 py-2 font-medium">{{ m.tableNumber }}</td>
                  <td class="px-4 py-2">{{ m.playerA.name }}</td>
                  <td class="px-4 py-2">{{ m.isBye ? 'BYE' : (m.playerB?.name ?? '—') }}</td>
                  <td class="px-4 py-2">{{ resultLabel(m) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="px-4 py-6 text-center text-zinc-500">Sin mesas.</td></tr>
              }
            </tbody>
          </table>
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
