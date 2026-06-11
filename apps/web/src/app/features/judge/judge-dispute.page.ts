import { DatePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { JudgeService, type DisputeDetail } from '../../core/judge.service';

/** Dispute resolution screen (SPEC §6.7 / §12 /juez/disputa/{matchId}). */
@Component({
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <div class="mx-auto max-w-2xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="page-title">Resolver disputa</h1>
        <a routerLink="/juez/cola" class="link text-sm">← Volver a la cola</a>
      </div>

      @if (error()) {
        <p class="alert-error" role="alert">{{ error() }}</p>
      }

      @if (dispute(); as d) {
        <section class="card" aria-labelledby="titulo-partida">
          <h2 id="titulo-partida" class="section-title">
            Mesa {{ d.match.tableNumber }}
            <span class="font-medium text-stone-500 dark:text-stone-400">· {{ d.match.tournamentName }} · Ronda {{ d.match.roundNumber }}</span>
          </h2>
          <p class="mt-2 text-sm text-stone-600 dark:text-stone-400">
            <span class="badge-neutral mr-1">A</span>{{ d.match.playerA?.name }}
            <span class="mx-2 text-stone-400 dark:text-stone-500">vs</span>
            <span class="badge-neutral mr-1">B</span>{{ d.match.playerB?.name ?? '—' }}
          </p>
        </section>

        <section aria-labelledby="titulo-reportes">
          <h2 id="titulo-reportes" class="section-title mb-3">Reportes enfrentados</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            @for (r of d.reports; track r.reporter.id) {
              <div class="card border-l-4 border-l-amber-400">
                <p class="text-sm font-semibold text-stone-900 dark:text-stone-100">{{ r.reporter.name }}</p>
                <p class="mt-2">
                  <span [class]="r.result === 'win' ? 'badge-success' : r.result === 'loss' ? 'badge-danger' : 'badge-neutral'">
                    Reportó {{ resultLabel(r.result) }}
                  </span>
                  @if (r.score) {
                    <span class="ml-2 font-mono text-sm font-semibold text-stone-700 dark:text-stone-300">{{ r.score }}</span>
                  }
                </p>
                <p class="mt-2 text-xs text-stone-400 dark:text-stone-500">Enviado a las {{ r.reportedAt | date: 'HH:mm:ss' }}</p>
              </div>
            }
          </div>
        </section>

        <form (ngSubmit)="resolve()" class="card space-y-5" aria-labelledby="titulo-resolucion">
          <h2 id="titulo-resolucion" class="section-title">Resolución</h2>

          <fieldset>
            <legend class="label">Resultado oficial</legend>
            <div class="grid gap-2 sm:grid-cols-2">
              <label class="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-4 py-3 text-sm font-medium text-stone-700 dark:text-stone-300 shadow-sm transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/40 has-[:checked]:border-stone-900 has-[:checked]:bg-stone-50 has-[:checked]:text-stone-900">
                <input type="radio" name="result" value="a_wins" [(ngModel)]="result"
                       class="h-4 w-4 shrink-0 border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100" />
                <span>Victoria de {{ d.match.playerA?.name }} (A)</span>
              </label>
              <label class="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-4 py-3 text-sm font-medium text-stone-700 dark:text-stone-300 shadow-sm transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/40 has-[:checked]:border-stone-900 has-[:checked]:bg-stone-50 has-[:checked]:text-stone-900">
                <input type="radio" name="result" value="b_wins" [(ngModel)]="result"
                       class="h-4 w-4 shrink-0 border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100" />
                <span>Victoria de {{ d.match.playerB?.name }} (B)</span>
              </label>
              <label class="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-4 py-3 text-sm font-medium text-stone-700 dark:text-stone-300 shadow-sm transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/40 has-[:checked]:border-stone-900 has-[:checked]:bg-stone-50 has-[:checked]:text-stone-900">
                <input type="radio" name="result" value="draw" [(ngModel)]="result"
                       class="h-4 w-4 shrink-0 border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100" />
                <span>Empate</span>
              </label>
              <label class="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-4 py-3 text-sm font-medium text-stone-700 dark:text-stone-300 shadow-sm transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/40 has-[:checked]:border-stone-900 has-[:checked]:bg-stone-50 has-[:checked]:text-stone-900">
                <input type="radio" name="result" value="forfeit_a" [(ngModel)]="result"
                       class="h-4 w-4 shrink-0 border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100" />
                <span>Forfeit de A (gana B)</span>
              </label>
              <label class="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-4 py-3 text-sm font-medium text-stone-700 dark:text-stone-300 shadow-sm transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/40 has-[:checked]:border-stone-900 has-[:checked]:bg-stone-50 has-[:checked]:text-stone-900">
                <input type="radio" name="result" value="forfeit_b" [(ngModel)]="result"
                       class="h-4 w-4 shrink-0 border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100" />
                <span>Forfeit de B (gana A)</span>
              </label>
              <label class="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-4 py-3 text-sm font-medium text-stone-700 dark:text-stone-300 shadow-sm transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/40 has-[:checked]:border-stone-900 has-[:checked]:bg-stone-50 has-[:checked]:text-stone-900">
                <input type="radio" name="result" value="forfeit_both" [(ngModel)]="result"
                       class="h-4 w-4 shrink-0 border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100" />
                <span>Doble forfeit (pierden ambos)</span>
              </label>
            </div>
          </fieldset>

          <div>
            <label for="score" class="label">Marcador (opcional)</label>
            <input id="score" type="text" [(ngModel)]="score" name="score" maxlength="20" placeholder="2-1"
                   class="input font-mono sm:max-w-[10rem]" />
            <p class="hint">Por ejemplo, 2-1 en un mejor de tres.</p>
          </div>

          <p class="alert-warning" role="alert">
            <strong>Atención:</strong> la decisión del juez es definitiva y sustituye a ambos reportes.
          </p>

          <button type="submit" [disabled]="busy()" class="btn-primary w-full">
            {{ busy() ? 'Resolviendo…' : 'Resolver disputa' }}
          </button>
        </form>
      }
    </div>
  `,
})
export default class JudgeDisputePage implements OnInit {
  readonly matchId = input.required<string>();
  private readonly judge = inject(JudgeService);
  private readonly router = inject(Router);

  protected readonly dispute = signal<DisputeDetail | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected result = 'a_wins';
  protected score = '';

  async ngOnInit(): Promise<void> {
    try {
      this.dispute.set(await this.judge.dispute(Number(this.matchId())));
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected resultLabel(result: string): string {
    return { win: 'victoria', loss: 'derrota', draw: 'empate' }[result] ?? result;
  }

  protected async resolve(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.judge.resolveDispute(Number(this.matchId()), this.result, this.score || undefined);
      await this.router.navigateByUrl('/juez/cola');
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
