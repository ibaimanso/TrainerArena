import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../../core/api-error';
import type { ParsedDecklist } from '../../core/player.service';

interface DecklistDetail {
  playerName: string;
  rawText: string;
  parsed: ParsedDecklist;
  submittedAt: string;
  lockedAt: string | null;
}

/** Judge decklist detail: parsed sections + raw text (SPEC §9). */
@Component({
  imports: [RouterLink, DatePipe],
  template: `
    <div class="mx-auto max-w-3xl space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">Decklist</h1>
        <a [routerLink]="['/juez/torneo', slug(), 'decklists']"
           class="text-sm text-indigo-600 hover:underline">Volver al listado</a>
      </div>

      @if (error()) {
        <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
      }

      @if (decklist(); as d) {
        <div class="rounded-lg bg-white p-4 shadow">
          <h2 class="font-semibold">{{ d.playerName }}</h2>
          <p class="text-xs text-zinc-500">
            {{ d.parsed.total }} cartas · enviada {{ d.submittedAt | date: 'd MMM, HH:mm' }}
            @if (d.lockedAt) { · bloqueada {{ d.lockedAt | date: 'd MMM, HH:mm' }} }
          </p>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <div class="space-y-4 rounded-lg bg-white p-4 text-sm shadow">
            @for (section of sections(d); track section.title) {
              @if (section.cards.length > 0) {
                <div>
                  <h3 class="font-medium text-zinc-700">{{ section.title }} ({{ count(section.cards) }})</h3>
                  <ul class="mt-1 space-y-0.5 text-zinc-600">
                    @for (card of section.cards; track card.name + card.set + card.number) {
                      <li>{{ card.quantity }}× {{ card.name }}
                        <span class="text-zinc-400">{{ card.set }} {{ card.number }}</span></li>
                    }
                  </ul>
                </div>
              }
            }
          </div>
          <div class="rounded-lg bg-white p-4 shadow">
            <h3 class="text-sm font-medium text-zinc-700">Texto original</h3>
            <pre class="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-zinc-600">{{ d.rawText }}</pre>
          </div>
        </div>
      }
    </div>
  `,
})
export default class JudgeDecklistDetailPage implements OnInit {
  readonly slug = input.required<string>();
  readonly userId = input.required<string>();
  private readonly http = inject(HttpClient);
  protected readonly decklist = signal<DecklistDetail | null>(null);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ decklist: DecklistDetail }>(
          `/api/judge/tournaments/${this.slug()}/decklists/${this.userId()}`
        )
      );
      this.decklist.set(res.decklist);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected sections(d: DecklistDetail) {
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
