import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { RealtimeService } from '../../core/realtime.service';
import { RoundsService, type MatchMessage } from '../../core/rounds.service';

/** Payload of the `match.message` realtime event, forwarded by the parent page. */
export interface IncomingMatchMessage {
  message_id: number;
  match_id: number;
  sender: { id: number; name: string };
  message: string;
  sent_at: string;
}

/**
 * Player-to-player chat (mirrors the judge call chat). The parent page owns
 * the `private-match.{id}` subscription (RealtimeService unsubscribes the
 * whole channel on cleanup, so two subscribers would race) and forwards
 * `match.message` payloads through the `incoming` input.
 */
@Component({
  selector: 'app-match-chat',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="space-y-3">
      @if (error()) {
        <p class="alert-error" role="alert">{{ error() }}</p>
      }
      <div class="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/40 p-3"
           role="log" aria-label="Mensajes del chat con tu rival" aria-live="polite">
        @for (m of messages(); track m.id) {
          <div [class]="m.sender.id === auth.user()?.id ? 'text-right' : 'text-left'">
            <div class="inline-block max-w-[85%] rounded-lg px-3 py-2 text-left text-sm"
                 [class]="m.sender.id === auth.user()?.id ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-stone-800 shadow-sm'">
              <p class="text-xs font-semibold opacity-75">{{ m.sender.name }}</p>
              <p class="whitespace-pre-line">{{ m.message }}</p>
              <p class="mt-0.5 text-[10px] opacity-60">{{ m.sentAt | date: 'HH:mm' }}</p>
            </div>
          </div>
        } @empty {
          <p class="py-4 text-center text-xs text-stone-400 dark:text-stone-500">Sin mensajes todavía. ¡Saluda a tu rival!</p>
        }
      </div>

      @if (readOnly()) {
        <p class="rounded-lg bg-stone-100 dark:bg-stone-800 px-3 py-2 text-center text-xs text-stone-500 dark:text-stone-400" role="status">
          Partida terminada — el chat es de solo lectura.
        </p>
      } @else {
        <form (ngSubmit)="send()" class="flex gap-2">
          <input type="text" [(ngModel)]="draft" name="draft" maxlength="2000"
                 placeholder="Escribe a tu rival…" aria-label="Mensaje para tu rival"
                 class="input flex-1" />
          <button type="submit" [disabled]="!draft.trim() || sending()" class="btn-primary shrink-0">
            {{ sending() ? 'Enviando…' : 'Enviar' }}
          </button>
        </form>
      }
    </div>
  `,
})
export class MatchChatComponent implements OnInit, OnDestroy {
  readonly matchId = input.required<number>();
  readonly incoming = input<IncomingMatchMessage | null>(null);

  protected readonly auth = inject(AuthService);
  private readonly rounds = inject(RoundsService);
  private readonly realtime = inject(RealtimeService);

  protected readonly messages = signal<MatchMessage[]>([]);
  protected readonly readOnly = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected draft = '';

  private poll: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      const p = this.incoming();
      if (!p || p.match_id !== this.matchId()) return;
      if (this.messages().some((m) => m.id === p.message_id)) return;
      this.messages.update((list) => [
        ...list,
        { id: p.message_id, sender: p.sender, message: p.message, sentAt: p.sent_at },
      ]);
    });
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
    // Soft polling fallback when WebSockets are unavailable (SPEC §11 degradation).
    this.poll = setInterval(() => {
      if (!this.realtime.connected() && !this.readOnly()) void this.reload();
    }, 5000);
  }

  ngOnDestroy(): void {
    if (this.poll) clearInterval(this.poll);
  }

  private async reload(): Promise<void> {
    try {
      const res = await this.rounds.matchMessages(this.matchId());
      this.messages.set(res.messages);
      this.readOnly.set(res.readOnly);
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
      const res = await this.rounds.sendMatchMessage(this.matchId(), text);
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
