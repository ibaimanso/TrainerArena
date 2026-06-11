import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorMessage } from '../../core/api-error';
import { RoundsService, type ManualPairingState } from '../../core/rounds.service';

/** Manual pairing (SPEC §6.2 + fix 4.2: rematch confirmation). */
@Component({
  imports: [FormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-2xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="page-title">Pareo manual</h1>
        <a routerLink="/admin/torneos" class="link text-sm">Volver a mis torneos</a>
      </div>

      @if (error()) {
        <p class="alert-error" role="alert">{{ error() }}</p>
      }

      @if (state(); as s) {
        <p class="flex flex-wrap items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
          <span class="font-semibold text-stone-900 dark:text-stone-100">Ronda {{ s.round.roundNumber }}</span>
          <span [class]="s.round.phase === 'swiss' ? 'badge-neutral' : 'badge-brand'">
            {{ s.round.phase === 'swiss' ? 'Suiza' : 'Top cut' }}
          </span>
          <span [class]="s.round.status === 'pending' ? 'badge-warning' : 'badge-neutral'">
            {{ s.round.status === 'pending' ? 'Pendiente' : s.round.status }}
          </span>
        </p>

        @if (s.round.status === 'pending' && s.unpaired.length > 0) {
          <section class="card space-y-4" aria-labelledby="titulo-sin-mesa">
            <h2 id="titulo-sin-mesa" class="section-title">
              Jugadores sin mesa
              <span class="badge-warning ml-1">{{ s.unpaired.length }}</span>
            </h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label for="playerA" class="label">Jugador A</label>
                <select id="playerA" [(ngModel)]="playerAId" required class="input">
                  <option [ngValue]="null">— Selecciona —</option>
                  @for (p of s.unpaired; track p.id) {
                    <option [ngValue]="p.id">{{ p.name }}</option>
                  }
                </select>
              </div>
              <div>
                <label for="playerB" class="label">Jugador B</label>
                <select id="playerB" [(ngModel)]="playerBId" class="input">
                  <option [ngValue]="null">BYE</option>
                  @for (p of s.unpaired; track p.id) {
                    <option [ngValue]="p.id">{{ p.name }}</option>
                  }
                </select>
                <p class="hint">Deja «BYE» para dar la ronda ganada al jugador A.</p>
              </div>
            </div>
            @if (rematchWarning()) {
              <div class="alert-warning flex flex-wrap items-center justify-between gap-3" role="alert">
                <span>{{ rematchWarning() }}</span>
                <button type="button" (click)="add(true)" [disabled]="busy()" class="btn-warning btn-sm">
                  Forzar rematch
                </button>
              </div>
            }
            <button type="button" (click)="add(false)" [disabled]="playerAId === null || busy()"
                    class="btn-primary">
              {{ busy() ? 'Añadiendo…' : 'Añadir mesa' }}
            </button>
          </section>
        }

        <section aria-labelledby="titulo-mesas" class="space-y-3">
          <h2 id="titulo-mesas" class="section-title">Mesas creadas</h2>
          @if (s.matches.length === 0) {
            <div class="empty-state">
              <svg class="h-10 w-10 text-stone-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <p>Sin mesas todavía.</p>
              <p class="text-xs text-stone-400 dark:text-stone-500">Las mesas que parees aparecerán aquí.</p>
            </div>
          } @else {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th scope="col">Mesa</th>
                    <th scope="col">Jugador A</th>
                    <th scope="col">Jugador B</th>
                  </tr>
                </thead>
                <tbody>
                  @for (m of s.matches; track m.tableNumber) {
                    <tr>
                      <td class="font-medium text-stone-500 dark:text-stone-400">{{ m.tableNumber }}</td>
                      <td class="font-medium text-stone-900 dark:text-stone-100">{{ m.playerA.name }}</td>
                      <td>
                        @if (m.playerB) {
                          <span class="font-medium text-stone-900 dark:text-stone-100">{{ m.playerB.name }}</span>
                        } @else {
                          <span class="badge-neutral">BYE</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }
    </div>
  `,
})
export default class ManualPairingPage implements OnInit {
  readonly id = input.required<string>();
  private readonly service = inject(RoundsService);

  protected readonly state = signal<ManualPairingState | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly rematchWarning = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected playerAId: number | null = null;
  protected playerBId: number | null = null;

  async ngOnInit(): Promise<void> {
    try {
      this.state.set(await this.service.manualState(Number(this.id())));
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected async add(allowRematch: boolean): Promise<void> {
    if (this.playerAId === null) return;
    this.busy.set(true);
    this.error.set(null);
    if (allowRematch) this.rematchWarning.set(null);
    try {
      const state = await this.service.manualPair(
        Number(this.id()),
        this.playerAId,
        this.playerBId,
        allowRematch
      );
      this.state.set(state);
      this.playerAId = null;
      this.playerBId = null;
      this.rematchWarning.set(null);
    } catch (e) {
      const message = apiErrorMessage(e);
      if (e instanceof HttpErrorResponse && e.status === 422 && message.includes('rematch')) {
        this.rematchWarning.set(message);
      } else {
        this.error.set(message);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
