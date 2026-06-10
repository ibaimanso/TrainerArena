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
    <div class="mx-auto max-w-2xl space-y-4">
      <h1 class="text-2xl font-bold">Pareo manual</h1>

      @if (error()) {
        <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
      }

      @if (state(); as s) {
        <p class="text-sm text-zinc-600">
          Ronda {{ s.round.roundNumber }} ({{ s.round.phase === 'swiss' ? 'suiza' : 'top cut' }}) —
          estado: {{ s.round.status === 'pending' ? 'pendiente' : s.round.status }}
        </p>

        <section class="rounded-lg bg-white p-4 shadow">
          <h2 class="text-sm font-semibold">Mesas creadas</h2>
          <ul class="mt-2 space-y-1 text-sm">
            @for (m of s.matches; track m.tableNumber) {
              <li class="flex items-center gap-2">
                <span class="w-14 text-zinc-400">Mesa {{ m.tableNumber }}</span>
                <span>{{ m.playerA.name }}</span>
                <span class="text-zinc-400">vs</span>
                <span>{{ m.playerB?.name ?? 'BYE' }}</span>
              </li>
            } @empty {
              <li class="text-zinc-500">Sin mesas todavía.</li>
            }
          </ul>
        </section>

        @if (s.round.status === 'pending' && s.unpaired.length > 0) {
          <section class="space-y-3 rounded-lg bg-white p-4 shadow">
            <h2 class="text-sm font-semibold">Jugadores sin mesa ({{ s.unpaired.length }})</h2>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="playerA" class="mb-1 block text-xs font-medium text-zinc-500">Jugador A</label>
                <select id="playerA" [(ngModel)]="playerAId"
                        class="w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
                  <option [ngValue]="null">— Selecciona —</option>
                  @for (p of s.unpaired; track p.id) {
                    <option [ngValue]="p.id">{{ p.name }}</option>
                  }
                </select>
              </div>
              <div>
                <label for="playerB" class="mb-1 block text-xs font-medium text-zinc-500">Jugador B</label>
                <select id="playerB" [(ngModel)]="playerBId"
                        class="w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none">
                  <option [ngValue]="null">BYE</option>
                  @for (p of s.unpaired; track p.id) {
                    <option [ngValue]="p.id">{{ p.name }}</option>
                  }
                </select>
              </div>
            </div>
            @if (rematchWarning()) {
              <div class="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {{ rematchWarning() }}
                <button type="button" (click)="add(true)"
                        class="ml-2 rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-400">
                  Forzar rematch
                </button>
              </div>
            }
            <button type="button" (click)="add(false)" [disabled]="playerAId === null || busy()"
                    class="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
              Añadir mesa
            </button>
          </section>
        }

        <a routerLink="/admin/torneos" class="inline-block text-sm text-indigo-600 hover:underline">
          Volver a mis torneos
        </a>
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
