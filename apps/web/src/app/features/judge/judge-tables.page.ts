import { DatePipe } from '@angular/common';
import { Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import {
  JudgeService,
  type ForceOutcome,
  type RoundTable,
  type RoundTables,
} from '../../core/judge.service';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  active: 'Activa',
  awaiting_confirmation: 'Esperando confirmación',
  disputed: 'En disputa',
  finished: 'Terminada',
  bye: 'Bye',
  forfeit_a: 'Game loss A',
  forfeit_b: 'Game loss B',
  forfeit_both: 'Game loss doble',
};

const REPORT_LABELS: Record<string, string> = { win: 'victoria', loss: 'derrota', draw: 'empate' };

/**
 * Round control board (/juez/torneo/:slug/mesas): every table of the current
 * round with full info; judges and the organizer can force results on
 * stalled tables (victory, draw on BO3, single or double game loss).
 */
@Component({
  imports: [RouterLink, DatePipe],
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="page-title">
            Mesas
            @if (data(); as d) {
              <span class="text-stone-400 dark:text-stone-500">— Ronda {{ d.round.roundNumber }}</span>
            }
          </h1>
          <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
            @if (data(); as d) {
              {{ d.tournament.name }} · {{ d.round.phase === 'swiss' ? 'Suiza' : 'Top cut' }} ·
              BO{{ d.round.bestOf }}. Fuerza el resultado de una mesa solo cuando los jugadores
              no puedan reportarlo ellos mismos.
            } @else {
              Control de la ronda en curso para jueces y organización.
            }
          </p>
        </div>
        <a [routerLink]="['/torneo', slug()]" class="link text-sm">Volver al torneo</a>
      </div>

      @if (error()) {
        <p class="alert-error" role="alert">{{ error() }}</p>
      }
      @if (actionError()) {
        <p class="alert-error" role="alert">{{ actionError() }}</p>
      }

      @if (loading()) {
        <div class="card space-y-3" aria-label="Cargando mesas">
          <div class="skeleton h-5 w-2/3"></div>
          <div class="skeleton h-5 w-1/2"></div>
          <div class="skeleton h-5 w-3/5"></div>
        </div>
      } @else if (data(); as d) {
        <ol class="space-y-4" aria-label="Mesas de la ronda">
          @for (m of d.matches; track m.id) {
            <li class="card space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="font-semibold text-stone-900 dark:text-stone-100">
                  Mesa {{ m.tableNumber }}
                  <span class="font-normal text-stone-500 dark:text-stone-400">
                    · {{ m.playerA?.name }} @if (!m.isBye) { vs {{ m.playerB?.name }} }
                  </span>
                </p>
                <span [class]="m.status === 'finished' ? 'badge-success'
                        : m.status === 'disputed' ? 'badge-danger'
                        : m.status === 'active' || m.status === 'awaiting_confirmation' ? 'badge-brand'
                        : m.status === 'bye' ? 'badge-neutral'
                        : m.status.startsWith('forfeit') ? 'badge-warning'
                        : 'badge-neutral'">
                  {{ statusLabel(m.status) }}
                </span>
              </div>

              @if (m.isBye) {
                <p class="text-sm text-stone-500 dark:text-stone-400">
                  {{ m.playerA?.name }} descansa esta ronda (bye).
                </p>
              } @else {
                <div class="grid gap-3 text-sm sm:grid-cols-2">
                  <div class="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                    <p class="font-medium text-stone-900 dark:text-stone-100">{{ m.playerA?.name }}</p>
                    @if (m.playerA?.tcgLiveUsername) {
                      <p class="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                        TCG Live: <span class="font-mono">{{ m.playerA?.tcgLiveUsername }}</span>
                      </p>
                    }
                    <p class="mt-1.5 text-xs" [class]="m.checkInA ? 'text-green-700 dark:text-green-400' : 'text-stone-500 dark:text-stone-400'">
                      {{ m.checkInA ? '✓ Check-in ' + (m.checkInA | date: 'HH:mm') : 'Sin check-in' }}
                    </p>
                    <p class="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                      {{ reportFor(m, m.playerA?.id) }}
                    </p>
                  </div>
                  <div class="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                    <p class="font-medium text-stone-900 dark:text-stone-100">{{ m.playerB?.name }}</p>
                    @if (m.playerB?.tcgLiveUsername) {
                      <p class="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                        TCG Live: <span class="font-mono">{{ m.playerB?.tcgLiveUsername }}</span>
                      </p>
                    }
                    <p class="mt-1.5 text-xs" [class]="m.checkInB ? 'text-green-700 dark:text-green-400' : 'text-stone-500 dark:text-stone-400'">
                      {{ m.checkInB ? '✓ Check-in ' + (m.checkInB | date: 'HH:mm') : 'Sin check-in' }}
                    </p>
                    <p class="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                      {{ reportFor(m, m.playerB?.id) }}
                    </p>
                  </div>
                </div>

                @if (m.result) {
                  <p class="alert-success text-xs" role="status">
                    Resultado: {{ resultSummary(m) }}@if (m.result.score) { ({{ m.result.score }}) }
                  </p>
                } @else {
                  <div class="space-y-2 border-t border-stone-100 pt-3 dark:border-stone-800">
                    <p class="text-xs font-medium uppercase tracking-wide text-stone-400 dark:text-stone-500">
                      Forzar resultado
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <button type="button" (click)="force(m, 'a_wins')" [disabled]="busy()"
                              class="btn-success btn-sm">Victoria de {{ m.playerA?.name }}</button>
                      <button type="button" (click)="force(m, 'b_wins')" [disabled]="busy()"
                              class="btn-success btn-sm">Victoria de {{ m.playerB?.name }}</button>
                      @if (d.round.bestOf === 3) {
                        <button type="button" (click)="force(m, 'draw')" [disabled]="busy()"
                                class="btn-secondary btn-sm">Empate</button>
                      }
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button type="button" (click)="force(m, 'forfeit_a')" [disabled]="busy()"
                              class="btn-danger-outline btn-sm">Game loss a {{ m.playerA?.name }}</button>
                      <button type="button" (click)="force(m, 'forfeit_b')" [disabled]="busy()"
                              class="btn-danger-outline btn-sm">Game loss a {{ m.playerB?.name }}</button>
                      <button type="button" (click)="force(m, 'forfeit_both')" [disabled]="busy()"
                              class="btn-danger-outline btn-sm">Game loss a ambos</button>
                    </div>
                  </div>
                }
              }
            </li>
          } @empty {
            <li class="empty-state">Esta ronda no tiene mesas.</li>
          }
        </ol>
      }
    </div>
  `,
})
export default class JudgeTablesPage implements OnInit, OnDestroy {
  readonly slug = input.required<string>();
  private readonly judge = inject(JudgeService);

  protected readonly data = signal<RoundTables | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);

  private poll: ReturnType<typeof setInterval> | null = null;

  async ngOnInit(): Promise<void> {
    await this.reload();
    this.poll = setInterval(() => void this.reload(), 10000);
  }

  ngOnDestroy(): void {
    if (this.poll) clearInterval(this.poll);
  }

  private async reload(): Promise<void> {
    try {
      this.data.set(await this.judge.tables(this.slug()));
      this.error.set(null);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  protected reportFor(m: RoundTable, playerId: number | undefined): string {
    const report = m.reports.find((r) => r.reporter.id === playerId);
    if (!report) return 'Sin reporte';
    const label = REPORT_LABELS[report.result] ?? report.result;
    return `Reportó ${label}${report.score ? ` (${report.score})` : ''}`;
  }

  protected resultSummary(m: RoundTable): string {
    if (!m.result) return '';
    if (m.result.winnerId === null) return 'empate o doble game loss';
    const winner = m.result.winnerId === m.playerA?.id ? m.playerA : m.playerB;
    return `victoria de ${winner?.name ?? '—'}`;
  }

  protected async force(m: RoundTable, outcome: ForceOutcome): Promise<void> {
    const labels: Record<ForceOutcome, string> = {
      a_wins: `dar la victoria a ${m.playerA?.name}`,
      b_wins: `dar la victoria a ${m.playerB?.name}`,
      draw: 'marcar empate',
      forfeit_a: `dar game loss a ${m.playerA?.name}`,
      forfeit_b: `dar game loss a ${m.playerB?.name}`,
      forfeit_both: 'dar game loss a ambos jugadores',
    };
    const confirmed = window.confirm(
      `Mesa ${m.tableNumber}: ¿${labels[outcome]}?\n\nEsta acción cierra la partida y quedará registrada.`
    );
    if (!confirmed) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await this.judge.forceResult(m.id, outcome);
      await this.reload();
    } catch (e) {
      this.actionError.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
