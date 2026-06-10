import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  TournamentsService,
  type TournamentDetail,
  type ViewerContext,
} from '../../core/tournaments.service';
import { AuthService } from '../../core/auth.service';
import { TournamentHeaderComponent } from './tournament-header.component';

/** Public tournament page (SPEC §12 /torneo/{slug}): info + context-dependent CTAs. */
@Component({
  imports: [RouterLink, TournamentHeaderComponent],
  template: `
    @if (notFound()) {
      <div class="rounded-lg bg-white p-8 text-center shadow">
        <h1 class="text-2xl font-bold">Torneo no encontrado</h1>
        <p class="mt-2 text-sm text-zinc-500">El torneo no existe o ya no está disponible.</p>
        <a routerLink="/" class="mt-4 inline-block text-indigo-600 hover:underline">Volver a los torneos</a>
      </div>
    } @else if (tournament(); as t) {
      <div class="space-y-4">
        <app-tournament-header [tournament]="t" />

        <section class="rounded-lg bg-white p-6 shadow">
          <h2 class="font-semibold">Formato</h2>
          <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt class="text-zinc-500">Rondas suizas</dt>
              <dd class="font-medium">{{ t.swissRounds }} (BO{{ t.swissBo }})</dd>
            </div>
            <div>
              <dt class="text-zinc-500">Top cut</dt>
              <dd class="font-medium">
                @if (t.topCutSize > 0) { Top {{ t.topCutSize }} (BO{{ t.topCutBo }}) } @else { Sin top cut }
              </dd>
            </div>
            <div>
              <dt class="text-zinc-500">Tiempo por ronda</dt>
              <dd class="font-medium">{{ t.roundTimeMinutes }} min</dd>
            </div>
            <div>
              <dt class="text-zinc-500">Check-in</dt>
              <dd class="font-medium">{{ t.checkinMinutes }} min</dd>
            </div>
          </dl>

          @if (t.description) {
            <h2 class="mt-6 font-semibold">Descripción</h2>
            <p class="mt-2 whitespace-pre-line text-sm text-zinc-700">{{ t.description }}</p>
          }
        </section>

        <section class="rounded-lg bg-white p-6 shadow">
          <h2 class="font-semibold">Inscripción</h2>
          @if (viewer(); as v) {
            <div class="mt-3 space-y-3 text-sm">
              @if (!v.isAuthenticated) {
                <p class="text-zinc-600">Necesitas una cuenta para inscribirte.</p>
                <a [routerLink]="['/login']" [queryParams]="{ volver: '/torneo/' + t.slug }"
                   class="inline-block rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500">
                  Inicia sesión para inscribirte
                </a>
              } @else if (!v.isVerified) {
                <p class="text-zinc-600">Debes verificar tu email antes de inscribirte.</p>
                <a routerLink="/verificar-email"
                   class="inline-block rounded bg-amber-500 px-4 py-2 font-semibold text-white hover:bg-amber-400">
                  Verificar email
                </a>
              } @else if (v.registrationStatus === 'active') {
                <p class="rounded bg-green-50 px-3 py-2 text-green-800">Ya estás inscrito en este torneo.</p>
                <div class="flex flex-wrap gap-2">
                  <a [routerLink]="['/torneo', t.slug, 'mi-decklist']"
                     class="rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500">Mi decklist</a>
                  <a [routerLink]="['/torneo', t.slug, 'match-actual']"
                     class="rounded border border-indigo-600 px-4 py-2 font-semibold text-indigo-600 hover:bg-indigo-50">Mi match</a>
                </div>
              } @else if (v.registrationStatus === 'pending_payment') {
                <p class="rounded bg-amber-50 px-3 py-2 text-amber-800">
                  Tu inscripción está pendiente de pago.
                </p>
              } @else if (v.registrationStatus === 'dropped') {
                <p class="rounded bg-zinc-100 px-3 py-2 text-zinc-600">
                  Te diste de baja de este torneo.
                </p>
              } @else if (v.isFull) {
                <p class="rounded bg-red-50 px-3 py-2 text-red-700">Torneo lleno.</p>
              } @else if (v.canRegister) {
                <a [routerLink]="['/torneo', t.slug, 'inscripcion']"
                   class="inline-block rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500">
                  Inscribirme
                </a>
              } @else {
                <p class="text-zinc-600">Las inscripciones no están abiertas.</p>
              }

              @if (v.hasJudgeRole) {
                <div class="border-t border-zinc-100 pt-3">
                  @if (v.judgeApplicationStatus === null && t.status !== 'finished' && t.status !== 'cancelled') {
                    <a [routerLink]="['/torneo', t.slug, 'solicitar-juez']"
                       class="text-indigo-600 hover:underline">Solicitar ser juez de este torneo</a>
                  } @else if (v.judgeApplicationStatus === 'pending') {
                    <p class="text-zinc-600">Tu solicitud de juez está pendiente.</p>
                  } @else if (v.judgeApplicationStatus === 'approved') {
                    <p class="text-green-700">Eres juez aprobado de este torneo.</p>
                  } @else if (v.judgeApplicationStatus === 'rejected') {
                    <p class="text-zinc-600">Tu solicitud de juez fue rechazada.</p>
                  }
                </div>
              }
            </div>
          }
        </section>
      </div>
    } @else {
      <p class="text-center text-sm text-zinc-500">Cargando torneo…</p>
    }
  `,
})
export default class TournamentPage implements OnInit {
  readonly slug = input.required<string>();
  private readonly tournaments = inject(TournamentsService);
  protected readonly auth = inject(AuthService);

  protected readonly tournament = signal<TournamentDetail | null>(null);
  protected readonly viewer = signal<ViewerContext | null>(null);
  protected readonly notFound = signal(false);

  async ngOnInit(): Promise<void> {
    await this.auth.loadOnce();
    try {
      const data = await this.tournaments.detail(this.slug());
      this.tournament.set(data.tournament);
      this.viewer.set(data.viewer);
    } catch {
      this.notFound.set(true);
    }
  }
}
