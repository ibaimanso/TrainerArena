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
    <div class="mx-auto max-w-xl space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">Llamada a juez</h1>
        <a routerLink="/juez/cola" class="text-sm text-indigo-600 hover:underline">Volver a la cola</a>
      </div>

      @if (error()) {
        <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
      }

      @if (call(); as c) {
        <div class="rounded-lg bg-white p-4 shadow">
          <p class="text-sm font-semibold">
            {{ c.tournamentName }} · R{{ c.roundNumber }} · Mesa {{ c.tableNumber }}
          </p>
          <p class="mt-1 text-xs text-zinc-500">
            {{ c.playerA?.name }} vs {{ c.playerB?.name ?? '—' }}
          </p>
          <p class="mt-2 text-sm">
            Estado:
            <span class="rounded-full px-2 py-0.5 text-xs font-medium"
                  [class]="c.status === 'open' ? 'bg-amber-50 text-amber-700' : c.status === 'in_progress' ? 'bg-indigo-50 text-indigo-700' : 'bg-zinc-100 text-zinc-600'">
              {{ statusLabel(c.status) }}
            </span>
            @if (c.assignedJudge) {
              <span class="ml-2 text-xs text-zinc-500">Atiende: {{ c.assignedJudge.name }}</span>
            }
          </p>
          <div class="mt-3 flex gap-2">
            @if (c.status === 'open') {
              <button type="button" (click)="take()" [disabled]="busy()"
                      class="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                Atender
              </button>
            }
            @if (c.status !== 'resolved') {
              <button type="button" (click)="resolve()" [disabled]="busy()"
                      class="rounded bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50">
                Marcar como resuelta
              </button>
            }
          </div>
        </div>

        <div class="rounded-lg bg-white p-4 shadow">
          <app-judge-call-chat [callId]="c.id" />
        </div>
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
