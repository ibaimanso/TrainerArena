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
    <div class="mx-auto max-w-3xl space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">Mi decklist</h1>
        <a [routerLink]="['/torneo', slug()]" class="text-sm text-indigo-600 hover:underline">Volver al torneo</a>
      </div>

      @if (loading()) {
        <p class="text-sm text-zinc-500">Cargando…</p>
      } @else {
        @if (locked()) {
          <p class="rounded bg-zinc-100 px-3 py-2 text-sm text-zinc-600">
            La decklist está bloqueada desde el inicio de la primera ronda (solo lectura).
          </p>
        } @else if (!canEdit()) {
          <p class="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No puedes editar la decklist en este momento (necesitas una inscripción activa y que
            el torneo no haya empezado).
          </p>
        }

        <div class="grid gap-4 lg:grid-cols-2">
          <div class="space-y-3 rounded-lg bg-white p-4 shadow">
            <label for="raw" class="block text-sm font-medium">
              Pega aquí el export de Pokémon TCG Live
            </label>
            <textarea id="raw" [(ngModel)]="rawText" rows="18" [disabled]="!canEdit() || locked()"
                      placeholder="Pokémon: 12&#10;4 Charizard ex OBF 125&#10;…"
                      class="w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none disabled:bg-zinc-50"></textarea>
            @for (e of errors(); track e) {
              <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ e }}</p>
            }
            @if (saved()) {
              <p class="rounded bg-green-50 px-3 py-2 text-sm text-green-800">Decklist guardada.</p>
            }
            @if (canEdit() && !locked()) {
              <button type="button" (click)="save()" [disabled]="saving() || !rawText.trim()"
                      class="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                {{ saving() ? 'Guardando…' : 'Guardar decklist' }}
              </button>
            }
          </div>

          <div class="rounded-lg bg-white p-4 shadow">
            <h2 class="text-sm font-semibold">Lista interpretada</h2>
            @if (decklist(); as d) {
              <p class="mt-1 text-xs text-zinc-500">
                {{ d.parsed.total }} cartas · enviada {{ d.submittedAt | date: 'd MMM, HH:mm' }}
                @if (d.lockedAt) { · bloqueada }
              </p>
              <div class="mt-3 space-y-4 text-sm">
                @for (section of sections(d); track section.title) {
                  @if (section.cards.length > 0) {
                    <div>
                      <h3 class="font-medium text-zinc-700">{{ section.title }} ({{ count(section.cards) }})</h3>
                      <ul class="mt-1 space-y-0.5 text-zinc-600">
                        @for (card of section.cards; track card.name + card.set + card.number) {
                          <li>{{ card.quantity }}× {{ card.name }} <span class="text-zinc-400">{{ card.set }} {{ card.number }}</span></li>
                        }
                      </ul>
                    </div>
                  }
                }
              </div>
            } @else {
              <p class="mt-2 text-sm text-zinc-500">Todavía no has enviado tu decklist.</p>
            }
          </div>
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
