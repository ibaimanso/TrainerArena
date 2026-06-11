import { Component, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { JudgeService, type CallDetail } from '../../core/judge.service';
import { JudgeCallChatComponent } from './judge-call-chat.component';

/** Judge call detail (SPEC §12 /juez/call/{id}): chat + take/resolve per permissions. */
@Component({
  imports: [RouterLink, JudgeCallChatComponent],
  template: `
    <div class="mx-auto max-w-xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="page-title">Llamada a juez</h1>
        <a routerLink="/juez/cola" class="link text-sm">← Volver a la cola</a>
      </div>

      @if (error()) {
        <p class="alert-error" role="alert">{{ error() }}</p>
      }

      @if (call(); as c) {
        <section class="card" aria-labelledby="titulo-detalle-llamada">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <h2 id="titulo-detalle-llamada" class="section-title">
                Mesa {{ c.tableNumber }}
                <span class="font-medium text-stone-500 dark:text-stone-400">· {{ c.tournamentName }} · Ronda {{ c.roundNumber }}</span>
              </h2>
              <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
                {{ c.playerA?.name }} vs {{ c.playerB?.name ?? '—' }}
              </p>
            </div>
            <span role="status"
                  [class]="c.status === 'open' ? 'badge-warning' : c.status === 'in_progress' ? 'badge-brand' : 'badge-success'">
              {{ statusLabel(c.status) }}
            </span>
          </div>
          @if (c.assignedJudge) {
            <p class="mt-2 text-sm text-stone-500 dark:text-stone-400">Atiende: <span class="font-medium text-stone-700 dark:text-stone-300">{{ c.assignedJudge.name }}</span></p>
          }
          @if (c.status !== 'resolved') {
            <div class="mt-4 flex flex-wrap gap-2 border-t border-stone-100 dark:border-stone-800 pt-4">
              @if (c.status === 'open') {
                <button type="button" (click)="take()" [disabled]="busy()" class="btn-primary">
                  Atender
                </button>
              }
              <button type="button" (click)="resolve()" [disabled]="busy()" class="btn-success">
                Marcar como resuelta
              </button>
            </div>
          }
        </section>

        <section class="card" aria-labelledby="titulo-chat-llamada">
          <h2 id="titulo-chat-llamada" class="section-title mb-3">Chat de la llamada</h2>
          <app-judge-call-chat [callId]="c.id" />
        </section>
      }
    </div>
  `,
})
export default class JudgeCallPage implements OnInit {
  readonly id = input.required<string>();
  private readonly judge = inject(JudgeService);
  protected readonly auth = inject(AuthService);

  protected readonly call = signal<CallDetail | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  private readonly chat = viewChild(JudgeCallChatComponent);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const res = await this.judge.callDetail(Number(this.id()));
      this.call.set(res.call);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected statusLabel(status: string): string {
    return { open: 'Abierta', in_progress: 'En curso', resolved: 'Resuelta' }[status] ?? status;
  }

  protected async take(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.judge.take(Number(this.id()));
      await this.reload();
      await this.chat()?.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
      await this.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected async resolve(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.judge.resolve(Number(this.id()));
      await this.reload();
      await this.chat()?.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
