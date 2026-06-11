import { Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import type { ReportResult } from '@apptorneos/shared';
import { apiErrorMessage } from '../../core/api-error';
import { events } from '@apptorneos/shared';
import { RealtimeService } from '../../core/realtime.service';
import { JudgeService } from '../../core/judge.service';
import { RoundsService, type MyMatch, type MyMatchNotStarted } from '../../core/rounds.service';
import { ServerTimeService } from '../../core/server-time.service';
import { JudgeCallChatComponent } from '../judge/judge-call-chat.component';
import { MatchChatComponent, type IncomingMatchMessage } from './match-chat.component';

/** "Mi match" (SPEC §12): check-in, authoritative timer, report, states. Mobile-first. */
@Component({
  imports: [FormsModule, RouterLink, JudgeCallChatComponent, MatchChatComponent],
  template: `
    <div class="mx-auto max-w-md space-y-4">
      @if (notFound()) {
        <div class="empty-state">
          <svg class="h-10 w-10 text-stone-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12h8" />
          </svg>
          <h1 class="text-base font-semibold text-stone-700 dark:text-stone-300">Sin partida</h1>
          <p>No tienes partida en la ronda actual (si tienes un bye, descansa esta ronda).</p>
          <a [routerLink]="['/torneo', slug()]" class="btn-secondary btn-sm mt-2">Volver al torneo</a>
        </div>
      } @else if (notStarted(); as t) {
        <div class="card p-8 text-center">
          <h1 class="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">{{ t.name }}</h1>
          <p class="mt-2 text-sm text-stone-500 dark:text-stone-400">El torneo aún no ha comenzado.</p>
          @if (startRemainingMs() > 0) {
            <p class="mt-6 font-mono text-5xl font-bold tracking-tight text-stone-900 dark:text-stone-100">{{ startCountdown() }}</p>
            <p class="mt-2 text-xs text-stone-400 dark:text-stone-500">para el inicio del torneo</p>
          } @else {
            <p class="alert-info mt-6 text-left" role="status">
              El torneo comenzará en breve: cuando el organizador lance la primera ronda
              verás aquí tu partida.
            </p>
          }
          <a [routerLink]="['/torneo', slug()]" class="btn-secondary btn-sm mt-6">Volver al torneo</a>
        </div>
      } @else if (match(); as m) {
        <header class="card text-center">
          <p class="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {{ m.phase === 'swiss' ? 'Ronda suiza' : 'Top cut' }} {{ m.roundNumber }} · Mesa {{ m.tableNumber }} · BO{{ m.bestOf }}
          </p>
          <h1 class="mt-1 text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            vs {{ m.opponent?.name ?? '—' }}
          </h1>
          @if (m.opponent?.tcgLiveUsername) {
            <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Nombre en TCG Live:
              <span class="font-mono font-semibold text-stone-700 dark:text-stone-300">{{ m.opponent?.tcgLiveUsername }}</span>
            </p>
          }
          @if (m.endsAt && m.roundStatus === 'active') {
            <p class="mt-4 font-mono text-5xl font-bold tracking-tight"
               [class]="remainingMs() < 120000 ? 'text-red-600 dark:text-red-400' : 'text-stone-900 dark:text-stone-100'">
              {{ timer() }}
            </p>
            <p class="mt-1 text-xs text-stone-400 dark:text-stone-500">tiempo restante de ronda</p>
          } @else if (m.phase === 'top_cut') {
            <p class="mt-4 text-sm font-medium text-stone-600 dark:text-stone-400">Sin límite de tiempo</p>
          }
        </header>

        @if (error()) {
          <p class="alert-error" role="alert">{{ error() }}</p>
        }

        @switch (m.status) {
          @case ('active') {
            <section class="card space-y-3" aria-labelledby="titulo-checkin">
              <h2 id="titulo-checkin" class="section-title">Check-in</h2>
              <div class="grid grid-cols-2 gap-3 text-center text-sm">
                <div class="rounded-lg border p-3"
                     [class]="m.myCheckIn ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40' : 'border-stone-200 dark:border-stone-800'">
                  <p class="font-semibold" [class]="m.myCheckIn ? 'text-green-700 dark:text-green-400' : 'text-stone-700 dark:text-stone-300'">Tú</p>
                  @if (m.myTcgLiveUsername) {
                    <p class="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
                      Nombre en TCG Live: <span class="font-mono">{{ m.myTcgLiveUsername }}</span>
                    </p>
                  }
                  <p class="mt-0.5 text-xs" [class]="m.myCheckIn ? 'text-green-700 dark:text-green-400' : 'text-stone-500 dark:text-stone-400'">
                    {{ m.myCheckIn ? '✓ Listo' : 'Pendiente' }}
                  </p>
                </div>
                <div class="rounded-lg border p-3"
                     [class]="m.opponentCheckIn ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40' : 'border-stone-200 dark:border-stone-800'">
                  <p class="font-semibold" [class]="m.opponentCheckIn ? 'text-green-700 dark:text-green-400' : 'text-stone-700 dark:text-stone-300'">
                    {{ m.opponent?.name }}
                  </p>
                  @if (m.opponent?.tcgLiveUsername) {
                    <p class="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
                      Nombre en TCG Live: <span class="font-mono">{{ m.opponent?.tcgLiveUsername }}</span>
                    </p>
                  }
                  <p class="mt-0.5 text-xs" [class]="m.opponentCheckIn ? 'text-green-700 dark:text-green-400' : 'text-stone-500 dark:text-stone-400'">
                    {{ m.opponentCheckIn ? '✓ Listo' : 'Pendiente' }}
                  </p>
                </div>
              </div>
              @if (m.checkInDeadline && checkinRemainingMs() > 0 && (!m.myCheckIn || !m.opponentCheckIn)) {
                <div class="rounded-lg bg-stone-50 dark:bg-stone-800/40 px-3 py-2.5 text-center">
                  <p class="font-mono text-2xl font-bold"
                     [class]="checkinRemainingMs() < 60000 ? 'text-red-600 dark:text-red-400' : 'text-stone-900 dark:text-stone-100'">
                    {{ checkinTimer() }}
                  </p>
                  <p class="mt-0.5 text-xs text-stone-400 dark:text-stone-500">tiempo para hacer check-in</p>
                </div>
              }
              @if (!m.myCheckIn) {
                <button type="button" (click)="checkIn()" [disabled]="busy()" class="btn-warning btn-lg w-full">
                  ¡Listo!
                </button>
              } @else {
                <button type="button" disabled aria-disabled="true"
                        class="btn-success btn-lg w-full disabled:opacity-90">
                  ✓ Check-in hecho
                </button>
              }
            </section>

            <section class="card space-y-3" aria-labelledby="titulo-reporte">
              <h2 id="titulo-reporte" class="section-title">Reportar resultado</h2>
              <div class="grid gap-2" [class]="m.bestOf === 3 ? 'grid-cols-3' : 'grid-cols-2'"
                   role="group" aria-label="Tu resultado">
                <button type="button" (click)="reportResult = 'win'"
                        [attr.aria-pressed]="reportResult === 'win'"
                        [class]="reportButton('win', 'border-green-600 bg-green-600 text-white')">
                  Victoria
                </button>
                <button type="button" (click)="reportResult = 'loss'"
                        [attr.aria-pressed]="reportResult === 'loss'"
                        [class]="reportButton('loss', 'border-red-600 bg-red-600 text-white')">
                  Derrota
                </button>
                @if (m.bestOf === 3) {
                  <button type="button" (click)="reportResult = 'draw'"
                          [attr.aria-pressed]="reportResult === 'draw'"
                          [class]="reportButton('draw', 'border-stone-600 bg-stone-600 text-white')">
                    Empate
                  </button>
                }
              </div>
              <div>
                <label for="reportScore" class="label">Marcador <span class="font-normal text-stone-400 dark:text-stone-500">(opcional)</span></label>
                <input id="reportScore" type="text" [(ngModel)]="reportScore" maxlength="20"
                       placeholder="p. ej. 2-1" class="input" />
              </div>
              <button type="button" (click)="sendReport()" [disabled]="!reportResult || busy()"
                      class="btn-primary btn-lg w-full">
                Enviar resultado
              </button>
            </section>
          }
          @case ('awaiting_confirmation') {
            <section class="card space-y-3" aria-labelledby="titulo-confirmacion">
              <h2 id="titulo-confirmacion" class="section-title">Resultado</h2>
              @if (m.myReport) {
                <p class="alert-warning" role="status">
                  Has reportado <strong>{{ resultLabel(m.myReport.result) }}</strong>
                  @if (m.myReport.score) { ({{ m.myReport.score }}) }.
                  Esperando la confirmación de tu rival…
                </p>
              } @else {
                <p class="text-sm text-stone-600 dark:text-stone-400">
                  Tu rival ya ha reportado. Confirma el resultado:
                </p>
                <div class="grid gap-2" [class]="m.bestOf === 3 ? 'grid-cols-3' : 'grid-cols-2'"
                     role="group" aria-label="Tu resultado">
                  <button type="button" (click)="reportResult = 'win'"
                          [attr.aria-pressed]="reportResult === 'win'"
                          [class]="reportButton('win', 'border-green-600 bg-green-600 text-white')">Victoria</button>
                  <button type="button" (click)="reportResult = 'loss'"
                          [attr.aria-pressed]="reportResult === 'loss'"
                          [class]="reportButton('loss', 'border-red-600 bg-red-600 text-white')">Derrota</button>
                  @if (m.bestOf === 3) {
                    <button type="button" (click)="reportResult = 'draw'"
                            [attr.aria-pressed]="reportResult === 'draw'"
                            [class]="reportButton('draw', 'border-stone-600 bg-stone-600 text-white')">Empate</button>
                  }
                </div>
                <button type="button" (click)="sendReport()" [disabled]="!reportResult || busy()"
                        class="btn-primary btn-lg w-full">
                  Confirmar resultado
                </button>
              }
            </section>
          }
          @case ('disputed') {
            <section class="card" aria-label="Partida en disputa">
              <p class="alert-error" role="alert">
                Los reportes no coinciden: la partida está <strong>en disputa</strong> y la
                resolverá un juez. No tienes que hacer nada más.
              </p>
            </section>
          }
          @default {
            <section class="card space-y-3" aria-label="Partida terminada">
              <p class="alert-success" role="status">
                Partida terminada{{ resultSummary(m) }}.
              </p>
              <a [routerLink]="['/torneo', slug(), 'clasificacion']" class="btn-secondary btn-sm">
                Ver clasificación
              </a>
            </section>
          }
        }

        @if (m.opponent; as opponent) {
          <section class="card space-y-3" aria-labelledby="titulo-chat">
            <h2 id="titulo-chat" class="section-title">Chat con {{ opponent.name }}</h2>
            <app-match-chat [matchId]="m.id" [incoming]="chatMessage()" />
          </section>
        }

        <section class="card space-y-3" id="juez" aria-labelledby="titulo-juez">
          <h2 id="titulo-juez" class="section-title flex items-center gap-2">
            <svg class="h-4 w-4 text-stone-400 dark:text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3l7 4v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V7l7-4Z" />
            </svg>
            Juez
          </h2>
          @if (m.judgeCall; as call) {
            @if (call.assignedJudge) {
              <p class="alert-info" role="status">
                Te atiende: <strong>{{ call.assignedJudge.name }}</strong>
              </p>
            } @else {
              <p class="alert-warning" role="status">Esperando a que un juez atienda tu llamada…</p>
            }
            <app-judge-call-chat [callId]="call.id" />
          } @else {
            <button type="button" (click)="callJudge()" [disabled]="busy()"
                    class="btn-secondary w-full">
              Llamar juez
            </button>
            <p class="text-center text-xs text-stone-500 dark:text-stone-400">
              Si hay un problema en la partida, un juez vendrá a ayudaros.
            </p>
          }
        </section>
      } @else {
        <div class="card space-y-3" role="status" aria-label="Cargando partida">
          <div class="skeleton mx-auto h-4 w-1/2"></div>
          <div class="skeleton mx-auto h-8 w-2/3"></div>
          <div class="skeleton mx-auto h-12 w-1/3"></div>
        </div>
      }
    </div>
  `,
})
export default class MyMatchPage implements OnInit, OnDestroy {
  readonly slug = input.required<string>();
  private readonly rounds = inject(RoundsService);
  private readonly serverTime = inject(ServerTimeService);

  protected readonly match = signal<MyMatch | null>(null);
  protected readonly notStarted = signal<MyMatchNotStarted | null>(null);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly remainingMs = signal(0);
  protected readonly timer = signal('--:--');
  protected readonly checkinRemainingMs = signal(0);
  protected readonly checkinTimer = signal('--:--');
  protected readonly startRemainingMs = signal(0);
  protected readonly startCountdown = signal('--:--:--');
  protected readonly chatMessage = signal<IncomingMatchMessage | null>(null);
  protected reportResult: ReportResult | null = null;
  protected reportScore = '';

  private readonly realtime = inject(RealtimeService);
  private tick: ReturnType<typeof setInterval> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;

  async ngOnInit(): Promise<void> {
    await this.reload();
    this.tick = setInterval(() => this.updateTimer(), 1000);
    // Soft polling fallback when WebSockets are unavailable (SPEC §11 degradation).
    // Before round 1 there is no match channel, so always poll for the start.
    this.poll = setInterval(() => {
      if (this.notStarted() || !this.realtime.connected()) void this.reload();
    }, 10000);
    await this.ensureSubscribed();
  }

  ngOnDestroy(): void {
    if (this.tick) clearInterval(this.tick);
    if (this.poll) clearInterval(this.poll);
    this.unsubscribe?.();
  }

  private async ensureSubscribed(): Promise<void> {
    const m = this.match();
    if (!m || this.unsubscribe) return;
    const refresh = () => void this.reload();
    this.unsubscribe = await this.realtime.subscribe(`private-match.${m.id}`, {
      [events.matchAwaitingConfirmation]: refresh,
      [events.matchFinished]: refresh,
      [events.matchDisputed]: refresh,
      [events.matchForfeited]: refresh,
      [events.judgeCallResolved]: refresh,
      [events.matchMessage]: (payload) => this.chatMessage.set(payload as IncomingMatchMessage),
    });
  }

  private async reload(): Promise<void> {
    try {
      const res = await this.rounds.myMatch(this.slug());
      this.match.set(res.match);
      this.notStarted.set(res.notStarted ?? null);
      this.updateTimer();
      await this.ensureSubscribed();
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 404) {
        this.notFound.set(true);
        if (this.poll) clearInterval(this.poll);
      }
    }
  }

  private updateTimer(): void {
    const t = this.notStarted();
    if (t) {
      const remaining = this.serverTime.remainingMs(t.startAt);
      this.startRemainingMs.set(remaining);
      this.startCountdown.set(this.formatLong(remaining));
    }
    const m = this.match();
    if (!m) return;
    if (m.checkInDeadline) {
      const checkinRemaining = this.serverTime.remainingMs(m.checkInDeadline);
      this.checkinRemainingMs.set(checkinRemaining);
      this.checkinTimer.set(this.formatShort(checkinRemaining));
    }
    if (!m.endsAt) return;
    const remaining = this.serverTime.remainingMs(m.endsAt);
    this.remainingMs.set(remaining);
    this.timer.set(this.formatShort(remaining));
  }

  /** MM:SS for round/check-in timers. */
  private formatShort(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  /** "N días HH:MM:SS" (or HH:MM:SS under a day) for the tournament start. */
  private formatLong(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hms = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    if (days === 0) return hms;
    return `${days} ${days === 1 ? 'día' : 'días'} ${hms}`;
  }

  protected reportButton(value: ReportResult, active: string): string {
    const base = 'rounded-lg border px-3 py-3 text-sm font-semibold transition-colors';
    return this.reportResult === value
      ? `${base} ${active} shadow-sm`
      : `${base} border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800/40`;
  }

  protected async checkIn(): Promise<void> {
    const m = this.match();
    if (!m) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.rounds.checkIn(m.id);
      await this.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async sendReport(): Promise<void> {
    const m = this.match();
    if (!m || !this.reportResult) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.rounds.report(m.id, this.reportResult, this.reportScore || undefined);
      this.reportResult = null;
      this.reportScore = '';
      await this.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  private readonly judgeService = inject(JudgeService);

  protected async callJudge(): Promise<void> {
    const m = this.match();
    if (!m) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.judgeService.createCall(m.id);
      await this.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected resultLabel(result: ReportResult): string {
    return { win: 'victoria', loss: 'derrota', draw: 'empate' }[result];
  }

  protected resultSummary(m: MyMatch): string {
    if (!m.result) return '';
    if (m.result.winnerId === null) return ' (empate o doble forfeit)';
    const youWon = m.result.winnerId !== m.opponent?.id;
    return youWon ? ': ¡has ganado!' : ': ha ganado tu rival';
  }
}
