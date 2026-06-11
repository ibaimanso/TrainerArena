import { DatePipe } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { JudgeService, type QueueCall, type QueueDispute } from '../../core/judge.service';

/** Judge queue (SPEC §10.2 /juez/cola): live calls + disputed matches; 10s auto-refresh. */
@Component({
  imports: [RouterLink, DatePipe],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="page-title">Cola de juez</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Llamadas y disputas pendientes. La lista se actualiza automáticamente.
        </p>
      </div>

      @if (error()) {
        <p class="alert-error" role="alert">{{ error() }}</p>
      }

      <section aria-labelledby="titulo-disputas">
        <h2 id="titulo-disputas" class="section-title mb-3">Disputas</h2>
        @if (disputes().length === 0) {
          <div class="empty-state">
            <svg class="h-10 w-10 text-stone-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="m8.5 12.5 2.5 2.5 4.5-5" />
            </svg>
            <p>No hay disputas pendientes.</p>
            <p class="text-xs text-stone-400 dark:text-stone-500">Si dos jugadores reportan resultados distintos, aparecerán aquí.</p>
          </div>
        } @else {
          <div class="space-y-3">
            @for (d of disputes(); track d.matchId) {
              <div class="card flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-red-500">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="badge-danger">Disputa</span>
                    <p class="text-sm font-bold text-stone-900 dark:text-stone-100">
                      Mesa {{ d.tableNumber }}
                      <span class="font-medium text-stone-500 dark:text-stone-400">· {{ d.tournamentName }} · Ronda {{ d.roundNumber }}</span>
                    </p>
                  </div>
                  <p class="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
                    {{ d.playerA.name }} vs {{ d.playerB?.name ?? '—' }}
                  </p>
                </div>
                <a [routerLink]="['/juez/disputa', d.matchId]" class="btn-danger"
                   [attr.aria-label]="'Resolver disputa de la mesa ' + d.tableNumber + ' de ' + d.tournamentName">
                  Resolver
                </a>
              </div>
            }
          </div>
        }
      </section>

      <section aria-labelledby="titulo-llamadas">
        <h2 id="titulo-llamadas" class="section-title mb-3">Llamadas a juez</h2>
        @if (calls().length === 0) {
          <div class="empty-state">
            <svg class="h-10 w-10 text-stone-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="m8.5 12.5 2.5 2.5 4.5-5" />
            </svg>
            <p>No hay llamadas pendientes.</p>
            <p class="text-xs text-stone-400 dark:text-stone-500">Todo en orden: las nuevas llamadas aparecerán aquí al instante.</p>
          </div>
        } @else {
          <div class="space-y-3">
            @for (c of calls(); track c.id) {
              <div class="card flex flex-wrap items-center justify-between gap-3 border-l-4"
                   [class]="c.status === 'open' ? 'border-l-amber-400' : 'border-l-stone-400'">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    @if (c.status === 'open') {
                      <span class="badge-warning">Abierta</span>
                    } @else {
                      <span class="badge-brand">En curso</span>
                    }
                    <p class="text-sm font-bold text-stone-900 dark:text-stone-100">
                      Mesa {{ c.tableNumber }}
                      <span class="font-medium text-stone-500 dark:text-stone-400">· {{ c.tournamentName }}</span>
                    </p>
                  </div>
                  <p class="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
                    Llamada de {{ c.createdBy.name }} · {{ c.createdAt | date: 'HH:mm' }}
                    @if (c.assignedJudge) { · Atiende: {{ c.assignedJudge.name }} }
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  @if (c.status === 'open') {
                    <button type="button" (click)="take(c)" class="btn-primary"
                            [attr.aria-label]="'Atender la llamada de la mesa ' + c.tableNumber + ' de ' + c.tournamentName">
                      Atender
                    </button>
                  }
                  <a [routerLink]="['/juez/call', c.id]" class="btn-secondary"
                     [attr.aria-label]="'Abrir la llamada de la mesa ' + c.tableNumber + ' de ' + c.tournamentName">
                    Abrir
                  </a>
                </div>
              </div>
            }
          </div>
        }
      </section>
    </div>
  `,
})
export default class JudgeQueuePage implements OnInit, OnDestroy {
  private readonly judge = inject(JudgeService);
  protected readonly calls = signal<QueueCall[]>([]);
  protected readonly disputes = signal<QueueDispute[]>([]);
  protected readonly error = signal<string | null>(null);
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
      const res = await this.judge.queue();
      this.calls.set(res.calls);
      this.disputes.set(res.disputes);
      this.error.set(null);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected async take(c: QueueCall): Promise<void> {
    try {
      await this.judge.take(c.id);
      await this.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
      await this.reload();
    }
  }
}
