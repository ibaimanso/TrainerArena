import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { PlayerService, type ParsedDecklist } from '../../core/player.service';
import { DecklistExportComponent } from '../../shared/decklist-export.component';

interface RivalDecklist {
  playerName: string;
  rawText: string;
  parsed: ParsedDecklist;
  submittedAt: string;
  lockedAt: string | null;
}

/**
 * Rival decklist viewed from the standings table. Only available when the
 * tournament enables showOpponentDecklists and the list is locked.
 */
@Component({
  imports: [RouterLink, DatePipe, DecklistExportComponent],
  template: `
    <div class="mx-auto max-w-3xl space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="page-title">Decklist</h1>
        <a [routerLink]="['/torneo', slug(), 'clasificacion']" class="link text-sm">← Volver a la clasificación</a>
      </div>

      @if (error()) {
        <p class="alert-error" role="alert">{{ error() }}</p>
      }

      @if (decklist(); as d) {
        <section class="card" aria-labelledby="titulo-jugador">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 id="titulo-jugador" class="section-title">{{ d.playerName }}</h2>
            <span class="badge-brand">{{ d.parsed.total }} cartas</span>
          </div>
          <p class="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
            Enviada {{ d.submittedAt | date: 'd MMM, HH:mm' }}
            @if (d.lockedAt) { · bloqueada {{ d.lockedAt | date: 'd MMM, HH:mm' }} }
          </p>
          <div class="mt-3">
            <app-decklist-export [playerName]="d.playerName" [rawText]="d.rawText"
                                 [parsed]="d.parsed" />
          </div>
        </section>

        <div class="grid gap-4 lg:grid-cols-2">
          <section class="card space-y-5 text-sm" aria-label="Lista por secciones">
            @for (section of sections(); track section.title) {
              @if (section.cards.length > 0) {
                <div>
                  <h3 class="section-title flex items-baseline justify-between gap-2 border-b border-stone-100 dark:border-stone-800 pb-2">
                    {{ section.title }}
                    <span class="font-mono text-xs font-semibold text-stone-500 dark:text-stone-400">{{ count(section.cards) }} cartas</span>
                  </h3>
                  <ul class="mt-2 space-y-1 text-stone-700 dark:text-stone-300">
                    @for (card of section.cards; track card.name + card.set + card.number) {
                      <li class="flex items-baseline gap-2">
                        <span class="w-8 shrink-0 text-right font-mono font-semibold tabular-nums">{{ card.quantity }}×</span>
                        <span>{{ card.name }}
                          <span class="text-xs text-stone-400 dark:text-stone-500">{{ card.set }} {{ card.number }}</span></span>
                      </li>
                    }
                  </ul>
                </div>
              }
            }
          </section>

          <section class="card" aria-labelledby="titulo-texto-original">
            <h3 id="titulo-texto-original" class="section-title border-b border-stone-100 dark:border-stone-800 pb-2">Texto original</h3>
            <pre class="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-stone-50 dark:bg-stone-800/40 p-3 font-mono text-xs leading-relaxed text-stone-600 dark:text-stone-400">{{ d.rawText }}</pre>
          </section>
        </div>
      } @else if (!error()) {
        <div class="card space-y-3" aria-label="Cargando decklist">
          <div class="skeleton h-5 w-1/3"></div>
          <div class="skeleton h-4 w-1/2"></div>
          <div class="skeleton h-40 w-full"></div>
        </div>
      }
    </div>
  `,
})
export default class PlayerDecklistPage implements OnInit {
  readonly slug = input.required<string>();
  readonly userId = input.required<string>();
  private readonly player = inject(PlayerService);

  protected readonly decklist = signal<RivalDecklist | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly sections = computed(() => {
    const d = this.decklist();
    if (!d) return [];
    return [
      { title: 'Pokémon', cards: d.parsed.pokemon },
      { title: 'Entrenador', cards: d.parsed.trainer },
      { title: 'Energía', cards: d.parsed.energy },
    ];
  });

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.player.opponentDecklist(this.slug(), Number(this.userId()));
      this.decklist.set(res.decklist);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected count(cards: { quantity: number }[]): number {
    return cards.reduce((sum, c) => sum + c.quantity, 0);
  }
}
