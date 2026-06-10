import { DatePipe } from '@angular/common';
import { Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { events } from '@apptorneos/shared';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { JudgeService, type CallDetail, type CallMessage } from '../../core/judge.service';
import { RealtimeService } from '../../core/realtime.service';

/** Persisted judge-call chat (SPEC §10.2): realtime + 5s polling fallback; read-only when resolved. */
@Component({
  selector: 'app-judge-call-chat',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="space-y-3">
      @if (error()) {
        <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
      }
      <div class="max-h-72 space-y-2 overflow-y-auto rounded border border-zinc-200 bg-zinc-50 p-3">
        @for (m of messages(); track m.id) {
          <div [class]="m.sender.id === auth.user()?.id ? 'text-right' : 'text-left'">
            <div class="inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm"
                 [class]="m.sender.id === auth.user()?.id ? 'bg-indigo-600 text-white' : 'bg-white shadow-sm'">
              <p class="text-xs font-semibold opacity-75">{{ m.sender.name }}</p>
              <p class="whitespace-pre-line">{{ m.message }}</p>
              <p class="mt-0.5 text-[10px] opacity-60">{{ m.sentAt | date: 'HH:mm' }}</p>
            </div>
          </div>
        } @empty {
          <p class="text-center text-xs text-zinc-400">Sin mensajes todavía.</p>
        }
      </div>

      @if (call()?.status === 'resolved') {
        <p class="rounded bg-zinc-100 px-3 py-2 text-center text-xs text-zinc-500">
          Llamada resuelta — el chat es de solo lectura.
        </p>
      } @else {
        <form (ngSubmit)="send()" class="flex gap-2">
          <input type="text" [(ngModel)]="draft" name="draft" maxlength="2000"
                 placeholder="Escribe un mensaje…"
                 class="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
          <button type="submit" [disabled]="!draft.trim() || sending()"
                  class="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            Enviar
          </button>
        </form>
      }
    </div>
  `,
})
export class JudgeCallChatComponent implements OnInit, OnDestroy {
  readonly callId = input.required<number>();
  protected readonly auth = inject(AuthService);
  private readonly judge = inject(JudgeService);
  private readonly realtime = inject(RealtimeService);

  protected readonly call = signal<CallDetail | null>(null);
  protected readonly messages = signal<CallMessage[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected draft = '';

  private poll: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;

  async ngOnInit(): Promise<void> {
    await this.reload();
    this.poll = setInterval(() => {
      if (!this.realtime.connected() && this.call()?.status !== 'resolved') void this.reload();
    }, 5000);
    this.unsubscribe = await this.realtime.subscribe(`private-judge_call.${this.callId()}`, {
      [events.judgeCallMessage]: (payload) => {
        const p = payload as {
          message_id: number;
          sender: { id: number; name: string };
          message: string;
          sent_at: string;
        };
        if (this.messages().some((m) => m.id === p.message_id)) return;
        this.messages.update((list) => [
          ...list,
          { id: p.message_id, sender: p.sender, message: p.message, sentAt: p.sent_at },
        ]);
      },
      [events.judgeCallTaken]: () => void this.reload(),
      [events.judgeCallResolved]: () => void this.reload(),
    });
  }

  ngOnDestroy(): void {
    if (this.poll) clearInterval(this.poll);
    this.unsubscribe?.();
  }

  async reload(): Promise<void> {
    try {
      const res = await this.judge.callDetail(this.callId());
      this.call.set(res.call);
      this.messages.set(res.messages);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected async send(): Promise<void> {
    const text = this.draft.trim();
    if (!text) return;
    this.sending.set(true);
    this.error.set(null);
    try {
      const res = await this.judge.sendMessage(this.callId(), text);
      if (!this.messages().some((m) => m.id === res.message.id)) {
        this.messages.update((list) => [...list, res.message]);
      }
      this.draft = '';
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.sending.set(false);
    }
  }
}
