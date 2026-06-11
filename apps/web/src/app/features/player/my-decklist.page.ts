import { DatePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { PlayerService, type DecklistView } from '../../core/player.service';

/** /torneo/{slug}/mi-decklist (SPEC §9/§12): textarea + parser result; read-only after lock. */
@Component({
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <div class="mx-auto max-w-3xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="page-title">Mi decklist</h1>
        <a [routerLink]="['/torneo', slug()]" class="btn-secondary btn-sm">Volver al torneo</a>
      </div>

      @if (loading()) {
        <div class="grid gap-4 lg:grid-cols-2" role="status" aria-label="Cargando tu decklist">
          <div class="card space-y-3">
            <div class="skeleton h-4 w-2/3"></div>
            <div class="skeleton h-64 w-full"></div>
          </div>
          <div class="card space-y-3">
            <div class="skeleton h-4 w-1/3"></div>
            <div class="skeleton h-4 w-1/2"></div>
            <div class="skeleton h-4 w-2/5"></div>
          </div>
        </div>
      } @else {
        @if (locked()) {
          <p class="alert-info" role="status">
            La decklist está bloqueada desde el inicio de la primera ronda (solo lectura).
          </p>
        } @else if (!canEdit()) {
          <p class="alert-warning" role="status">
            No puedes editar la decklist en este momento (necesitas una inscripción activa y que
            el torneo no haya empezado).
          </p>
        }

        <div class="grid gap-4 lg:grid-cols-2">
          <section class="card space-y-3" aria-labelledby="titulo-export">
            <h2 id="titulo-export" class="section-title">Tu lista</h2>
            <div>
              <label for="raw" class="label">Pega aquí el export de Pokémon TCG Live</label>
              <textarea id="raw" [(ngModel)]="rawText" rows="18" [disabled]="!canEdit() || locked()"
                        placeholder="Pokémon: 12&#10;4 Charizard ex OBF 125&#10;…"
                        class="input font-mono"></textarea>
              <p class="hint">En TCG Live: tu mazo → Exportar → copia y pega el texto completo.</p>
            </div>
            @for (e of errors(); track e) {
              <p class="alert-error" role="alert">{{ e }}</p>
            }
            @if (saved()) {
              <p class="alert-success" role="status">Decklist guardada.</p>
            }
            @if (canEdit() && !locked()) {
              <button type="button" (click)="save()" [disabled]="saving() || !rawText.trim()"
                      class="btn-primary w-full sm:w-auto">
                {{ saving() ? 'Guardando…' : 'Guardar decklist' }}
              </button>
            }
          </section>

          <section class="card" aria-labelledby="titulo-interpretada">
            <h2 id="titulo-interpretada" class="section-title">Lista interpretada</h2>
            @if (decklist(); as d) {
              <p class="mt-1 text-xs text-stone-500 dark:text-stone-400">
                {{ d.parsed.total }} cartas · enviada {{ d.submittedAt | date: 'd MMM, HH:mm' }}
                @if (d.lockedAt) { · <span class="font-medium">bloqueada</span> }
              </p>
              <div class="mt-4 space-y-4 text-sm">
                @for (section of sections(d); track section.title) {
                  @if (section.cards.length > 0) {
                    <div>
                      <h3 class="font-semibold text-stone-700 dark:text-stone-300">
                        {{ section.title }} <span class="font-normal text-stone-400 dark:text-stone-500">({{ count(section.cards) }})</span>
                      </h3>
                      <ul class="mt-1.5 space-y-1 text-stone-600 dark:text-stone-400">
                        @for (card of section.cards; track card.name + card.set + card.number) {
                          <li>{{ card.quantity }}× {{ card.name }} <span class="text-stone-400 dark:text-stone-500">{{ card.set }} {{ card.number }}</span></li>
                        }
                      </ul>
                    </div>
                  }
                }
              </div>
            } @else {
              <div class="mt-4 flex flex-col items-center gap-2 py-8 text-center text-sm text-stone-500 dark:text-stone-400">
                <svg class="h-10 w-10 text-stone-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="5" y="3" width="14" height="18" rx="2" />
                  <path d="M9 7h6M9 11h6M9 15h4" />
                </svg>
                <p>Todavía no has enviado tu decklist.</p>
                <p class="text-xs text-stone-400 dark:text-stone-500">Cuando la guardes verás aquí el desglose por tipo de carta.</p>
              </div>
            }
          </section>
        </div>
      }
    </div>
  `,
})
export default class MyDecklistPage implements OnInit {
  readonly slug = input.required<string>();
  private readonly player = inject(PlayerService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly decklist = signal<DecklistView | null>(null);
  protected readonly canEdit = signal(false);
  protected rawText = '';

  protected locked(): boolean {
    return this.decklist()?.lockedAt != null;
  }

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.player.myDecklist(this.slug());
      this.decklist.set(res.decklist);
      this.canEdit.set(res.canEdit);
      this.rawText = res.decklist?.rawText ?? '';
    } catch (e) {
      this.errors.set([apiErrorMessage(e)]);
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.saved.set(false);
    this.errors.set([]);
    try {
      const res = await this.player.saveDecklist(this.slug(), this.rawText);
      this.decklist.set(res.decklist);
      this.saved.set(true);
    } catch (e) {
      if (e instanceof HttpErrorResponse && Array.isArray(e.error?.message)) {
        this.errors.set(e.error.message as string[]);
      } else {
        this.errors.set([apiErrorMessage(e)]);
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected sections(d: DecklistView) {
    return [
      { title: 'Pokémon', cards: d.parsed.pokemon },
      { title: 'Entrenador', cards: d.parsed.trainer },
      { title: 'Energía', cards: d.parsed.energy },
    ];
  }

  protected count(cards: { quantity: number }[]): number {
    return cards.reduce((sum, c) => sum + c.quantity, 0);
  }
}
