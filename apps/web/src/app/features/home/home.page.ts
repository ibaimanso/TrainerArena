import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatFee } from '@apptorneos/shared';
import {
  TournamentsService,
  type LandingData,
  type TournamentSummary,
} from '../../core/tournaments.service';

/** Public landing (SPEC §12): open / ongoing / last 10 finished tournaments. */
@Component({
  imports: [RouterLink, DatePipe, NgTemplateOutlet],
  template: `
    <div class="space-y-8">
      <section class="rounded-lg bg-gradient-to-r from-indigo-700 to-violet-700 p-8 text-center text-white shadow">
        <h1 class="text-3xl font-bold">Torneos online de Pokémon TCG</h1>
        <p class="mx-auto mt-3 max-w-xl text-indigo-100">
          Rondas suizas con timer, top cut, decklists de TCG Live, jueces en vivo y
          clasificación en tiempo real.
        </p>
      </section>

      @if (loading()) {
        <p class="text-center text-sm text-zinc-500">Cargando torneos…</p>
      } @else if (data(); as landing) {
        <section>
          <h2 class="mb-3 text-xl font-bold">Inscripciones abiertas</h2>
          @if (landing.open.length === 0) {
            <p class="rounded-lg bg-white p-4 text-sm text-zinc-500 shadow">
              Ahora mismo no hay torneos con inscripción abierta.
            </p>
          } @else {
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              @for (t of landing.open; track t.slug) {
                <ng-container *ngTemplateOutlet="card; context: { $implicit: t }" />
              }
            </div>
          }
        </section>

        @if (landing.ongoing.length > 0) {
          <section>
            <h2 class="mb-3 text-xl font-bold">En curso</h2>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              @for (t of landing.ongoing; track t.slug) {
                <ng-container *ngTemplateOutlet="card; context: { $implicit: t }" />
              }
            </div>
          </section>
        }

        @if (landing.finished.length > 0) {
          <section>
            <h2 class="mb-3 text-xl font-bold">Últimos torneos terminados</h2>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              @for (t of landing.finished; track t.slug) {
                <ng-container *ngTemplateOutlet="card; context: { $implicit: t }" />
              }
            </div>
          </section>
        }
      } @else {
        <p class="text-center text-sm text-red-600">No se pudieron cargar los torneos.</p>
      }
    </div>

    <ng-template #card let-t>
      <a [routerLink]="['/torneo', t.slug]"
         class="block rounded-lg bg-white p-4 shadow transition hover:shadow-md">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold">{{ t.name }}</h3>
          <span class="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            {{ fee(t) }}
          </span>
        </div>
        <p class="mt-2 text-sm text-zinc-500">{{ t.startAt | date: 'EEEE d MMMM, HH:mm' }}</p>
        <p class="mt-1 text-sm text-zinc-500">
          {{ t.activeCount }} / {{ t.maxPlayers }} plazas
        </p>
      </a>
    </ng-template>
  `,
})
export default class HomePage implements OnInit {
  private readonly tournaments = inject(TournamentsService);
  protected readonly data = signal<LandingData | null>(null);
  protected readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    try {
      this.data.set(await this.tournaments.landing());
    } catch {
      this.data.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  protected fee(t: TournamentSummary): string {
    return formatFee(t.feeAmount, t.feeCurrency);
  }
}
