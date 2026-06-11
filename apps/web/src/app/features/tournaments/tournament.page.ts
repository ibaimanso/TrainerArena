import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  TournamentsService,
  type TournamentDetail,
  type ViewerContext,
} from '../../core/tournaments.service';
import { AuthService } from '../../core/auth.service';
import { apiErrorMessage } from '../../core/api-error';
import { PlayerService } from '../../core/player.service';
import { TournamentHeaderComponent } from './tournament-header.component';

/** Public tournament page (SPEC §12 /torneo/{slug}): info + context-dependent CTAs. */
@Component({
  imports: [RouterLink, TournamentHeaderComponent],
  template: `
    @if (notFound()) {
      <div class="empty-state">
        <svg class="h-10 w-10 text-stone-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3M8 11h6" />
        </svg>
        <h1 class="text-lg font-bold text-stone-900 dark:text-stone-100">Torneo no encontrado</h1>
        <p>El torneo no existe o ya no está disponible.</p>
        <a routerLink="/" class="btn-secondary mt-2">Volver a los torneos</a>
      </div>
    } @else if (tournament(); as t) {
      <div class="space-y-6">
        <app-tournament-header [tournament]="t" />

        <section class="card sm:p-6" aria-labelledby="titulo-formato">
          <h2 id="titulo-formato" class="section-title">Formato</h2>
          <dl class="mt-4 grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
            <div class="flex items-start gap-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/40 p-3">
              <svg class="mt-0.5 h-5 w-5 shrink-0 text-stone-400 dark:text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7" />
              </svg>
              <div>
                <dt class="text-xs text-stone-500 dark:text-stone-400">Rondas suizas</dt>
                <dd class="mt-0.5 font-semibold text-stone-900 dark:text-stone-100">{{ t.swissRounds }} (BO{{ t.swissBo }})</dd>
              </div>
            </div>
            <div class="flex items-start gap-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/40 p-3">
              <svg class="mt-0.5 h-5 w-5 shrink-0 text-stone-400 dark:text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
              <div>
                <dt class="text-xs text-stone-500 dark:text-stone-400">Top cut</dt>
                <dd class="mt-0.5 font-semibold text-stone-900 dark:text-stone-100">
                  @if (t.topCutSize > 0) { Top {{ t.topCutSize }} (BO{{ t.topCutBo }}) } @else { Sin top cut }
                </dd>
              </div>
            </div>
            <div class="flex items-start gap-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/40 p-3">
              <svg class="mt-0.5 h-5 w-5 shrink-0 text-stone-400 dark:text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <div>
                <dt class="text-xs text-stone-500 dark:text-stone-400">Tiempo por ronda</dt>
                <dd class="mt-0.5 font-semibold text-stone-900 dark:text-stone-100">{{ t.roundTimeMinutes }} min</dd>
              </div>
            </div>
            <div class="flex items-start gap-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/40 p-3">
              <svg class="mt-0.5 h-5 w-5 shrink-0 text-stone-400 dark:text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <div>
                <dt class="text-xs text-stone-500 dark:text-stone-400">Check-in</dt>
                <dd class="mt-0.5 font-semibold text-stone-900 dark:text-stone-100">{{ t.checkinMinutes }} min</dd>
              </div>
            </div>
          </dl>

          @if (t.description) {
            <h3 class="section-title mt-6">Descripción</h3>
            <p class="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-700 dark:text-stone-300">{{ t.description }}</p>
          }
        </section>

        <section class="card sm:p-6" aria-labelledby="titulo-inscripcion">
          <h2 id="titulo-inscripcion" class="section-title">Inscripción</h2>
          @if (viewer(); as v) {
            <div class="mt-4 space-y-4 text-sm">
              @if (!v.isAuthenticated) {
                <p class="text-stone-600 dark:text-stone-400">Necesitas una cuenta para inscribirte.</p>
                <a [routerLink]="['/login']" [queryParams]="{ volver: '/torneo/' + t.slug }"
                   class="btn-primary btn-lg">
                  Inicia sesión para inscribirte
                </a>
              } @else if (!v.isVerified) {
                <p class="alert-warning" role="status">Debes verificar tu email antes de inscribirte.</p>
                <a routerLink="/verificar-email" class="btn-warning">Verificar email</a>
              } @else if (v.registrationStatus === 'active') {
                <p class="alert-success" role="status">Ya estás inscrito en este torneo.</p>
                @if (dropError()) {
                  <p class="alert-error" role="alert">{{ dropError() }}</p>
                }
                <div class="flex flex-wrap gap-2">
                  <a [routerLink]="['/torneo', t.slug, 'mi-decklist']" class="btn-primary">Mi decklist</a>
                  <a [routerLink]="['/torneo', t.slug, 'match-actual']" class="btn-secondary">Mi match</a>
                  <button type="button" (click)="drop()" [disabled]="dropping()" class="btn-danger-outline">
                    {{ dropping() ? 'Procesando…' : 'Darme de baja' }}
                  </button>
                </div>
              } @else if (v.registrationStatus === 'pending_payment') {
                <p class="alert-warning" role="status">
                  Tu inscripción está pendiente de pago.
                </p>
              } @else if (v.registrationStatus === 'dropped') {
                <p class="alert-info" role="status">
                  Te diste de baja de este torneo.
                </p>
              } @else if (v.isFull) {
                <p class="alert-warning" role="status">Torneo lleno: no quedan plazas disponibles.</p>
              } @else if (v.canRegister) {
                <a [routerLink]="['/torneo', t.slug, 'inscripcion']" class="btn-primary btn-lg">
                  Inscribirme
                </a>
              } @else {
                <p class="text-stone-600 dark:text-stone-400">Las inscripciones no están abiertas.</p>
              }

              @if (v.hasJudgeRole) {
                <div class="border-t border-stone-100 dark:border-stone-800 pt-4">
                  @if (v.judgeApplicationStatus === null && t.status !== 'finished' && t.status !== 'cancelled') {
                    <a [routerLink]="['/torneo', t.slug, 'solicitar-juez']" class="link">
                      Solicitar ser juez de este torneo
                    </a>
                  } @else if (v.judgeApplicationStatus === 'pending') {
                    <p class="flex items-center gap-2 text-stone-600 dark:text-stone-400">
                      <span class="badge-warning">Pendiente</span> Tu solicitud de juez está pendiente.
                    </p>
                  } @else if (v.judgeApplicationStatus === 'approved') {
                    <p class="flex items-center gap-2 text-stone-600 dark:text-stone-400">
                      <span class="badge-success">Aprobada</span> Eres juez aprobado de este torneo.
                    </p>
                  } @else if (v.judgeApplicationStatus === 'rejected') {
                    <p class="flex items-center gap-2 text-stone-600 dark:text-stone-400">
                      <span class="badge-neutral">Rechazada</span> Tu solicitud de juez fue rechazada.
                    </p>
                  }
                </div>
              }
            </div>
          }
        </section>
      </div>
    } @else {
      <div class="space-y-6" aria-label="Cargando torneo">
        <div class="card space-y-4 sm:p-6">
          <div class="skeleton h-7 w-2/3"></div>
          <div class="skeleton h-4 w-1/3"></div>
          <div class="skeleton h-2 w-full"></div>
        </div>
        <div class="card space-y-3 sm:p-6">
          <div class="skeleton h-5 w-1/4"></div>
          <div class="skeleton h-16 w-full"></div>
        </div>
      </div>
    }
  `,
})
export default class TournamentPage implements OnInit {
  readonly slug = input.required<string>();
  private readonly tournaments = inject(TournamentsService);
  private readonly player = inject(PlayerService);
  protected readonly auth = inject(AuthService);

  protected readonly tournament = signal<TournamentDetail | null>(null);
  protected readonly viewer = signal<ViewerContext | null>(null);
  protected readonly notFound = signal(false);
  protected readonly dropping = signal(false);
  protected readonly dropError = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.auth.loadOnce();
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const data = await this.tournaments.detail(this.slug());
      this.tournament.set(data.tournament);
      this.viewer.set(data.viewer);
    } catch {
      this.notFound.set(true);
    }
  }

  protected async drop(): Promise<void> {
    if (!confirm('¿Seguro que quieres darte de baja? Tu plaza no se libera y no podrás volver a inscribirte.')) {
      return;
    }
    this.dropping.set(true);
    this.dropError.set(null);
    try {
      await this.player.drop(this.slug());
      await this.reload();
    } catch (e) {
      this.dropError.set(apiErrorMessage(e));
    } finally {
      this.dropping.set(false);
    }
  }
}
