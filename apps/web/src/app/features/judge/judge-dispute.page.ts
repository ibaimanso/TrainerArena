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
    <div class="mx-auto max-w-xl space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">Resolver disputa</h1>
        <a routerLink="/juez/cola" class="text-sm text-indigo-600 hover:underline">Volver a la cola</a>
      </div>

      @if (error()) {
        <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
      }

      @if (dispute(); as d) {
        <div class="rounded-lg bg-white p-4 shadow">
          <p class="text-sm font-semibold">
            {{ d.match.tournamentName }} · R{{ d.match.roundNumber }} · Mesa {{ d.match.tableNumber }}
          </p>
          <p class="mt-1 text-sm text-zinc-600">
            <strong>A:</strong> {{ d.match.playerA?.name }} ·
            <strong>B:</strong> {{ d.match.playerB?.name ?? '—' }}
          </p>
        </div>

        <div class="rounded-lg bg-white p-4 shadow">
          <h2 class="text-sm font-semibold">Reportes enfrentados</h2>
          <ul class="mt-2 space-y-2">
            @for (r of d.reports; track r.reporter.id) {
              <li class="rounded border border-zinc-200 px-3 py-2 text-sm">
                <strong>{{ r.reporter.name }}</strong> reportó
                <span class="font-medium">{{ resultLabel(r.result) }}</span>
                @if (r.score) { ({{ r.score }}) }
                <span class="text-xs text-zinc-400"> · {{ r.reportedAt | date: 'HH:mm:ss' }}</span>
              </li>
            }
          </ul>
        </div>

        <form (ngSubmit)="resolve()" class="space-y-3 rounded-lg bg-white p-4 shadow">
          <h2 class="text-sm font-semibold">Resolución</h2>
          <div>
            <label for="result" class="mb-1 block text-xs font-medium text-zinc-500">Resultado</label>
            <select id="result" [(ngModel)]="result" name="result"
                    class="w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
              <option value="a_wins">Victoria de {{ d.match.playerA?.name }} (A)</option>
              <option value="b_wins">Victoria de {{ d.match.playerB?.name }} (B)</option>
              <option value="draw">Empate</option>
              <option value="forfeit_a">Forfeit de A (gana B)</option>
              <option value="forfeit_b">Forfeit de B (gana A)</option>
              <option value="forfeit_both">Doble forfeit (pierden ambos)</option>
            </select>
          </div>
          <div>
            <label for="score" class="mb-1 block text-xs font-medium text-zinc-500">Marcador (opcional)</label>
            <input id="score" type="text" [(ngModel)]="score" name="score" maxlength="20" placeholder="2-1"
                   class="w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" />
          </div>
          <button type="submit" [disabled]="busy()"
                  class="w-full rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
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
