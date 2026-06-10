import { Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import type { ReportResult } from '@apptorneos/shared';
import { apiErrorMessage } from '../../core/api-error';
import { events } from '@apptorneos/shared';
import { RealtimeService } from '../../core/realtime.service';
import { JudgeService } from '../../core/judge.service';
import { RoundsService, type MyMatch } from '../../core/rounds.service';
import { ServerTimeService } from '../../core/server-time.service';
import { JudgeCallChatComponent } from '../judge/judge-call-chat.component';

/** "Mi match" (SPEC §12): check-in, authoritative timer, report, states. Mobile-first. */
@Component({
  imports: [FormsModule, RouterLink, JudgeCallChatComponent],
  template: `
    <div class="mx-auto max-w-md space-y-4">
      @if (notFound()) {
        <div class="rounded-lg bg-white p-8 text-center shadow">
          <h1 class="text-xl font-bold">Sin partida</h1>
          <p class="mt-2 text-sm text-zinc-500">
            No tienes partida en la ronda actual (si tienes un bye, descansa esta ronda).
          </p>
          <a [routerLink]="['/torneo', slug()]" class="mt-4 inline-block text-indigo-600 hover:underline">
            Volver al torneo
          </a>
        </div>
      } @else if (match(); as m) {
        <header class="rounded-lg bg-white p-4 text-center shadow">
          <p class="text-xs uppercase tracking-wide text-zinc-500">
            {{ m.phase === 'swiss' ? 'Ronda suiza' : 'Top cut' }} {{ m.roundNumber }} · Mesa {{ m.tableNumber }} · BO{{ m.bestOf }}
          </p>
          <h1 class="mt-1 text-xl font-bold">
            vs {{ m.opponent?.name ?? '—' }}
          </h1>
          @if (m.endsAt && m.roundStatus === 'active') {
            <p class="mt-3 font-mono text-4xl font-bold"
               [class]="remainingMs() < 120000 ? 'text-red-600' : 'text-zinc-800'">
              {{ timer() }}
            </p>
            <p class="text-xs text-zinc-400">tiempo restante</p>
          } @else if (m.phase === 'top_cut') {
            <p class="mt-3 text-sm font-medium text-zinc-600">Sin límite de tiempo</p>
          }
        </header>

        @if (error()) {
          <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
        }

        @switch (m.status) {
          @case ('active') {
            <section class="space-y-3 rounded-lg bg-white p-4 shadow">
              <h2 class="text-sm font-semibold">Check-in</h2>
              <div class="grid grid-cols-2 gap-3 text-center text-sm">
                <div class="rounded border p-3"
                     [class]="m.myCheckIn ? 'border-green-200 bg-green-50 text-green-700' : 'border-zinc-200'">
                  <p class="font-medium">Tú</p>
                  <p class="text-xs">{{ m.myCheckIn ? 'Listo' : 'Pendiente' }}</p>
                </div>
                <div class="rounded border p-3"
                     [class]="m.opponentCheckIn ? 'border-green-200 bg-green-50 text-green-700' : 'border-zinc-200'">
                  <p class="font-medium">{{ m.opponent?.name }}</p>
                  <p class="text-xs">{{ m.opponentCheckIn ? 'Listo' : 'Pendiente' }}</p>
                </div>
              </div>
              @if (!m.myCheckIn) {
                <button type="button" (click)="checkIn()" [disabled]="busy()"
                        class="w-full rounded bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-500 disabled:opacity-50">
                  ¡Listo!
                </button>
              }
            </section>

            <section class="space-y-3 rounded-lg bg-white p-4 shadow">
              <h2 class="text-sm font-semibold">Reportar resultado</h2>
              <div class="grid gap-2" [class]="m.bestOf === 3 ? 'grid-cols-3' : 'grid-cols-2'">
                <button type="button" (click)="reportResult = 'win'"
                        [class]="reportButton('win', 'bg-green-600 text-white border-green-600')">
                  Victoria
                </button>
                <button type="button" (click)="reportResult = 'loss'"
                        [class]="reportButton('loss', 'bg-red-600 text-white border-red-600')">
                  Derrota
                </button>
                @if (m.bestOf === 3) {
                  <button type="button" (click)="reportResult = 'draw'"
                          [class]="reportButton('draw', 'bg-zinc-600 text-white border-zinc-600')">
                    Empate
                  </button>
                }
              </div>
              <input type="text" [(ngModel)]="reportScore" maxlength="20" placeholder="Marcador (opcional, p. ej. 2-1)"
                     class="w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
              <button type="button" (click)="sendReport()" [disabled]="!reportResult || busy()"
                      class="w-full rounded bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                Enviar resultado
              </button>
            </section>
          }
          @case ('awaiting_confirmation') {
            <section class="rounded-lg bg-white p-4 shadow">
              @if (m.myReport) {
                <p class="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Has reportado <strong>{{ resultLabel(m.myReport.result) }}</strong>
                  @if (m.myReport.score) { ({{ m.myReport.score }}) }.
                  Esperando la confirmación de tu rival…
                </p>
              } @else {
                <p class="text-sm text-zinc-600">
                  Tu rival ya ha reportado. Confirma el resultado:
                </p>
                <div class="mt-3 grid gap-2" [class]="m.bestOf === 3 ? 'grid-cols-3' : 'grid-cols-2'">
                  <button type="button" (click)="reportResult = 'win'"
                          [class]="reportButton('win', 'bg-green-600 text-white border-green-600')">Victoria</button>
                  <button type="button" (click)="reportResult = 'loss'"
                          [class]="reportButton('loss', 'bg-red-600 text-white border-red-600')">Derrota</button>
                  @if (m.bestOf === 3) {
                    <button type="button" (click)="reportResult = 'draw'"
                            [class]="reportButton('draw', 'bg-zinc-600 text-white border-zinc-600')">Empate</button>
                  }
                </div>
                <button type="button" (click)="sendReport()" [disabled]="!reportResult || busy()"
                        class="mt-3 w-full rounded bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                  Confirmar resultado
                </button>
              }
            </section>
          }
          @case ('disputed') {
            <section class="rounded-lg bg-white p-4 shadow">
              <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                Los reportes no coinciden: la partida está <strong>en disputa</strong> y la
                resolverá un juez. No tienes que hacer nada más.
              </p>
            </section>
          }
          @default {
            <section class="rounded-lg bg-white p-4 shadow">
              <p class="rounded bg-green-50 px-3 py-2 text-sm text-green-800">
                Partida terminada{{ resultSummary(m) }}.
              </p>
              <a [routerLink]="['/torneo', slug(), 'clasificacion']"
                 class="mt-3 inline-block text-sm text-indigo-600 hover:underline">Ver clasificación</a>
            </section>
          }
        }

        <section class="space-y-3 rounded-lg bg-white p-4 shadow" id="juez">
          <h2 class="text-sm font-semibold">Juez</h2>
          @if (m.judgeCall; as call) {
            @if (call.assignedJudge) {
              <p class="rounded bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                Te atiende: <strong>{{ call.assignedJudge.name }}</strong>
              </p>
            } @else {
              <p class="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">Esperando juez…</p>
            }
            <app-judge-call-chat [callId]="call.id" />
          } @else {
            <button type="button" (click)="callJudge()" [disabled]="busy()"
                    class="w-full rounded border border-indigo-600 px-4 py-2 font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">
              Llamar juez
            </button>
          }
        </section>
      } @else {
        <p class="text-center text-sm text-zinc-500">Cargando partida…</p>
      }
    </div>
  `,
})
export default class MyMatchPage implements OnInit, OnDestroy {
  readonly slug = input.required<string>();
  private readonly rounds = inject(RoundsService);
  private readonly serverTime = inject(ServerTimeService);

  protected readonly match = signal<MyMatch | null>(null);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly remainingMs = signal(0);
  protected readonly timer = signal('--:--');
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
    this.poll = setInterval(() => {
      if (!this.realtime.connected()) void this.reload();
    }, 10000);
    const m = this.match();
    if (m) {
      const refresh = () => void this.reload();
      this.unsubscribe = await this.realtime.subscribe(`private-match.${m.id}`, {
        [events.matchAwaitingConfirmation]: refresh,
        [events.matchFinished]: refresh,
        [events.matchDisputed]: refresh,
        [events.matchForfeited]: refresh,
        [events.judgeCallResolved]: refresh,
      });
    }
  }

  ngOnDestroy(): void {
    if (this.tick) clearInterval(this.tick);
    if (this.poll) clearInterval(this.poll);
    this.unsubscribe?.();
  }

  private async reload(): Promise<void> {
    try {
      const res = await this.rounds.myMatch(this.slug());
      this.match.set(res.match);
      this.updateTimer();
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 404) {
        this.notFound.set(true);
        if (this.poll) clearInterval(this.poll);
      }
    }
  }

  private updateTimer(): void {
    const m = this.match();
    if (!m?.endsAt) return;
    const remaining = this.serverTime.remainingMs(m.endsAt);
    this.remainingMs.set(remaining);
    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    this.timer.set(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
  }

  protected reportButton(value: ReportResult, active: string): string {
    const base = 'rounded border px-3 py-3 text-sm font-semibold transition';
    return this.reportResult === value
      ? `${base} ${active}`
      : `${base} border-zinc-300 hover:bg-zinc-50`;
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
