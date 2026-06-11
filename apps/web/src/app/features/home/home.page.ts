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
    <div class="space-y-12">
      <section class="relative px-2 py-14 text-center sm:py-20">
        <div class="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-72 max-w-3xl"
             style="background: radial-gradient(ellipse at center top, rgba(79, 70, 229, 0.06), transparent 70%);"
             aria-hidden="true"></div>
        <p class="text-xs font-medium uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
          Trainer Arena
        </p>
        <h1 class="mx-auto mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100 sm:text-5xl"
            style="text-wrap: balance;">
          Torneos online de Pokémon TCG
        </h1>
        <p class="mx-auto mt-5 max-w-xl text-base leading-relaxed text-stone-500 dark:text-stone-400">
          Rondas suizas con timer, top cut, decklists de TCG Live, jueces en vivo y
          clasificación en tiempo real.
        </p>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button type="button" (click)="scrollToOpen()" class="btn-primary btn-lg">
            Ver torneos abiertos
          </button>
          <a routerLink="/registro" class="btn-secondary btn-lg">Crear cuenta</a>
        </div>
      </section>

      @if (loading()) {
        <section aria-label="Cargando torneos" class="card divide-y divide-stone-100 overflow-hidden p-0 dark:divide-stone-800">
          @for (i of [1, 2, 3]; track i) {
            <div class="flex items-center gap-4 px-5 py-4">
              <div class="skeleton h-12 w-12 shrink-0"></div>
              <div class="flex-1 space-y-2">
                <div class="skeleton h-4 w-1/2"></div>
                <div class="skeleton h-3 w-1/3"></div>
              </div>
            </div>
          }
        </section>
      } @else if (data(); as landing) {
        <section id="abiertos" class="scroll-mt-24" aria-labelledby="titulo-abiertos">
          <div class="mb-4 flex items-baseline gap-2">
            <h2 id="titulo-abiertos" class="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              Inscripciones abiertas
            </h2>
            @if (landing.open.length > 0) {
              <span class="badge-neutral">{{ landing.open.length }}</span>
            }
          </div>
          @if (landing.open.length === 0) {
            <div class="empty-state">
              <svg class="h-10 w-10 text-stone-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              <p>Ahora mismo no hay torneos con inscripción abierta.</p>
              <p class="text-xs text-stone-400 dark:text-stone-500">Vuelve pronto: los nuevos torneos aparecerán aquí.</p>
            </div>
          } @else {
            <div class="card divide-y divide-stone-100 overflow-hidden p-0 dark:divide-stone-800">
              @for (t of landing.open; track t.slug) {
                <ng-container *ngTemplateOutlet="row; context: { $implicit: t }" />
              }
            </div>
          }
        </section>

        @if (landing.ongoing.length > 0) {
          <section aria-labelledby="titulo-curso">
            <div class="mb-4 flex items-baseline gap-2">
              <h2 id="titulo-curso" class="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                En curso
              </h2>
              <span class="badge-brand">En directo</span>
            </div>
            <div class="card divide-y divide-stone-100 overflow-hidden p-0 dark:divide-stone-800">
              @for (t of landing.ongoing; track t.slug) {
                <ng-container *ngTemplateOutlet="row; context: { $implicit: t }" />
              }
            </div>
          </section>
        }

        @if (landing.finished.length > 0) {
          <section aria-labelledby="titulo-terminados">
            <h2 id="titulo-terminados" class="mb-4 text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              Últimos torneos terminados
            </h2>
            <div class="card divide-y divide-stone-100 overflow-hidden p-0 dark:divide-stone-800">
              @for (t of landing.finished; track t.slug) {
                <ng-container *ngTemplateOutlet="row; context: { $implicit: t }" />
              }
            </div>
          </section>
        }
      } @else {
        <p class="alert-error text-center" role="alert">
          No se pudieron cargar los torneos. Comprueba tu conexión e inténtalo de nuevo.
        </p>
      }
    </div>

    <ng-template #row let-t>
      <a [routerLink]="['/torneo', t.slug]"
         class="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/40">
        <div class="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
             aria-hidden="true">
          <span class="text-base font-bold leading-none">{{ t.startAt | date: 'd' }}</span>
          <span class="mt-1 text-[10px] font-medium uppercase leading-none opacity-70">{{ t.startAt | date: 'MMM' }}</span>
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold text-stone-900 transition-colors group-hover:text-indigo-600 dark:text-stone-100 dark:group-hover:text-indigo-400">
            {{ t.name }}
          </p>
          <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-500 dark:text-stone-400">
            <span>{{ t.startAt | date: 'EEEE, HH:mm' }}</span>
            <span class="inline-flex items-center gap-1.5">
              <span class="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" aria-hidden="true">
                <span class="block h-full rounded-full bg-indigo-500" [style.width.%]="occupancy(t)"></span>
              </span>
              {{ t.activeCount }}/{{ t.maxPlayers }} plazas
            </span>
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-3">
          <span class="badge-brand">{{ fee(t) }}</span>
          <svg class="h-4 w-4 text-stone-300 transition-transform group-hover:translate-x-0.5 dark:text-stone-600"
               viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
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

  /** % of seats taken, for the occupancy bar. */
  protected occupancy(t: TournamentSummary): number {
    return t.maxPlayers > 0 ? Math.min(100, Math.round((t.activeCount / t.maxPlayers) * 100)) : 0;
  }

  /**
   * Plain anchors get intercepted by the router (scrollPositionRestoration
   * resets to top), so the hero CTA scrolls imperatively.
   */
  protected scrollToOpen(): void {
    document.getElementById('abiertos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
