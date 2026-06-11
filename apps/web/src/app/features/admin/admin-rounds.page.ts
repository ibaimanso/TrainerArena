import { DatePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { RoundsService, type AdminRound } from '../../core/rounds.service';

/** Admin round management (SPEC §12 /admin/torneo/{slug}/rondas). */
@Component({
  imports: [RouterLink, DatePipe],
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="page-title">Rondas</h1>
          <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Genera pareos, inicia y cierra las rondas del torneo.</p>
        </div>
        <a routerLink="/admin/torneos" class="link text-sm">Volver a mis torneos</a>
      </div>

      @if (error()) {
        <p class="alert-error" role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="alert-warning" role="status">{{ notice() }}</p>
      }

      <div class="card flex flex-wrap items-center justify-between gap-3 p-4">
        <p class="text-sm text-stone-600 dark:text-stone-400">
          <span class="font-semibold text-stone-900 dark:text-stone-100">Suizas: {{ swissPlayed() }} / {{ swissRounds() }}</span>
          @if (topCutSize() > 0) { · Top cut {{ topCutSize() }} (automático al cerrar la última suiza) }
        </p>
        @if (canGenerate()) {
          <button type="button" (click)="generate()" [disabled]="busy()" class="btn-primary">
            Generar pareos (R{{ swissPlayed() + 1 }})
          </button>
        }
      </div>

      <ol class="space-y-3" aria-label="Lista de rondas">
        @for (r of rounds(); track r.id) {
          <li class="card p-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="section-title">Ronda {{ r.roundNumber }}</h2>
                  <span [class]="r.phase === 'swiss' ? 'badge-neutral' : 'badge-brand'">
                    {{ r.phase === 'swiss' ? 'Suiza' : 'Top cut' }}
                  </span>
                  <span [class]="r.status === 'active' ? 'badge-success' : r.status === 'pending' ? 'badge-warning' : 'badge-neutral'">
                    {{ statusLabel(r.status) }}
                  </span>
                </div>
                <p class="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
                  {{ r.totalMatches }} mesas
                  @for (entry of counts(r); track entry[0]) {
                    · {{ matchStatusLabel(entry[0]) }}: {{ entry[1] }}
                  }
                </p>
                @if (r.endsAt && r.status === 'active') {
                  <p class="mt-1 text-xs text-stone-500 dark:text-stone-400">Termina: {{ r.endsAt | date: 'HH:mm:ss' }}</p>
                }
              </div>
              <div class="flex flex-wrap gap-2">
                @if (r.status === 'pending') {
                  <button type="button" (click)="start(r)" [disabled]="busy()" class="btn-success btn-sm">
                    Iniciar ronda
                  </button>
                  <a [routerLink]="['/admin/rondas', r.id, 'pareo-manual']" class="btn-secondary btn-sm">
                    Pareo manual
                  </a>
                }
                @if (r.status === 'active') {
                  <button type="button" (click)="close(r)" [disabled]="busy()" class="btn-warning btn-sm">
                    Cerrar ronda
                  </button>
                }
                <a [routerLink]="['/torneo', slug(), 'pareos', 'ronda', r.roundNumber]" class="btn-secondary btn-sm">
                  Ver pareos
                </a>
              </div>
            </div>
          </li>
        } @empty {
          <li class="empty-state">
            <svg class="h-10 w-10 text-stone-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
            <p>Todavía no hay rondas.</p>
            <p class="text-xs text-stone-400 dark:text-stone-500">
              Genera los pareos de la primera ronda cuando las inscripciones estén cerradas.
            </p>
          </li>
        }
      </ol>
    </div>
  `,
})
export default class AdminRoundsPage implements OnInit {
  readonly slug = input.required<string>();
  private readonly service = inject(RoundsService);
  private readonly router = inject(Router);

  protected readonly rounds = signal<AdminRound[]>([]);
  protected readonly swissRounds = signal(0);
  protected readonly topCutSize = signal(0);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const res = await this.service.adminRounds(this.slug());
      this.rounds.set(res.rounds);
      this.swissRounds.set(res.swissRounds);
      this.topCutSize.set(res.topCutSize);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected swissPlayed(): number {
    return this.rounds().filter((r) => r.phase === 'swiss').length;
  }

  protected canGenerate(): boolean {
    return (
      this.swissPlayed() < this.swissRounds() &&
      !this.rounds().some((r) => r.status === 'pending' || r.status === 'active')
    );
  }

  protected counts(r: AdminRound): Array<[string, number]> {
    return Object.entries(r.matchCounts);
  }

  protected statusLabel(status: string): string {
    return { pending: 'Pendiente', active: 'En curso', finished: 'Cerrada' }[status] ?? status;
  }

  protected matchStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'pendientes',
      active: 'en juego',
      awaiting_confirmation: 'por confirmar',
      disputed: 'en disputa',
      finished: 'terminadas',
      bye: 'byes',
      forfeit_a: 'forfeit A',
      forfeit_b: 'forfeit B',
      forfeit_both: 'doble forfeit',
    };
    return labels[status] ?? status;
  }

  protected async generate(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const res = await this.service.generate(this.slug());
      if (res.manualRequired) {
        this.notice.set(res.manualMessage ?? 'El pareo automático no pudo completarse.');
        await this.router.navigate(['/admin/rondas', res.roundId, 'pareo-manual']);
        return;
      }
      await this.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async start(r: AdminRound): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.service.start(r.id);
      await this.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async close(r: AdminRound): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.service.close(r.id);
      await this.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
