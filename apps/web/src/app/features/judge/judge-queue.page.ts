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
      <h1 class="text-2xl font-bold">Cola de juez</h1>

      @if (error()) {
        <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
      }

      <section>
        <h2 class="mb-2 font-semibold">Disputas</h2>
        @if (disputes().length === 0) {
          <p class="rounded-lg bg-white p-4 text-sm text-zinc-500 shadow">No hay disputas pendientes.</p>
        } @else {
          <div class="space-y-2">
            @for (d of disputes(); track d.matchId) {
              <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border-l-4 border-red-500 bg-white p-4 shadow">
                <div>
                  <p class="text-sm font-semibold">
                    {{ d.tournamentName }} · R{{ d.roundNumber }} · Mesa {{ d.tableNumber }}
                  </p>
                  <p class="text-xs text-zinc-500">
                    {{ d.playerA.name }} vs {{ d.playerB?.name ?? '—' }}
                  </p>
                </div>
                <a [routerLink]="['/juez/disputa', d.matchId]"
                   class="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500">
                  Resolver
                </a>
              </div>
            }
          </div>
        }
      </section>

      <section>
        <h2 class="mb-2 font-semibold">Llamadas a juez</h2>
        @if (calls().length === 0) {
          <p class="rounded-lg bg-white p-4 text-sm text-zinc-500 shadow">No hay llamadas abiertas.</p>
        } @else {
          <div class="space-y-2">
            @for (c of calls(); track c.id) {
              <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border-l-4 bg-white p-4 shadow"
                   [class]="c.status === 'open' ? 'border-amber-500' : 'border-indigo-500'">
                <div>
                  <p class="text-sm font-semibold">
                    {{ c.tournamentName }} · Mesa {{ c.tableNumber }}
                  </p>
                  <p class="text-xs text-zinc-500">
                    Llamada de {{ c.createdBy.name }} · {{ c.createdAt | date: 'HH:mm' }}
                    @if (c.assignedJudge) { · Atiende: {{ c.assignedJudge.name }} }
                  </p>
                </div>
                <div class="flex gap-2">
                  @if (c.status === 'open') {
                    <button type="button" (click)="take(c)"
                            class="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500">
                      Atender
                    </button>
                  }
                  <a [routerLink]="['/juez/call', c.id]"
                     class="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50">Abrir</a>
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
