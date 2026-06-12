import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../../core/api-error';

interface DecklistRow {
  userId: number;
  playerName: string;
  total: number;
  submittedAt: string;
  lockedAt: string | null;
}

interface MissingRow {
  userId: number;
  playerName: string;
}

/** Judge decklist listing (SPEC §12 /juez/torneo/{slug}/decklists). */
@Component({
  imports: [RouterLink, DatePipe],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="page-title">Decklists del torneo</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Listas enviadas por los jugadores, con su recuento de cartas y fecha de bloqueo.
        </p>
      </div>

      @if (error()) {
        <p class="alert-error" role="alert">{{ error() }}</p>
      }

      @if (missing().length > 0) {
        <section class="alert-warning" aria-labelledby="titulo-sin-decklist" role="status">
          <h2 id="titulo-sin-decklist" class="font-semibold">
            Sin decklist ({{ missing().length }})
          </h2>
          <p class="mt-1 text-xs">
            Estos jugadores inscritos aún no han enviado su lista: recibirán un
            <strong>game loss automático en cada ronda que empiece</strong> hasta que la envíen.
          </p>
          <ul class="mt-2 flex flex-wrap gap-1.5">
            @for (m of missing(); track m.userId) {
              <li class="badge-warning">{{ m.playerName }}</li>
            }
          </ul>
        </section>
      }

      @if (decklists().length === 0) {
        <div class="empty-state">
          <svg class="h-10 w-10 text-stone-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M9 13h6M9 17h6" />
          </svg>
          <p>Sin decklists todavía.</p>
          <p class="text-xs text-stone-400 dark:text-stone-500">Aparecerán aquí cuando los jugadores las envíen.</p>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Jugador</th>
                <th scope="col">Cartas</th>
                <th scope="col">Enviada</th>
                <th scope="col">Bloqueada</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (d of decklists(); track d.userId) {
                <tr>
                  <td class="font-medium text-stone-900 dark:text-stone-100">{{ d.playerName }}</td>
                  <td class="font-mono tabular-nums">{{ d.total }}</td>
                  <td class="text-stone-500 dark:text-stone-400">{{ d.submittedAt | date: 'd MMM, HH:mm' }}</td>
                  <td class="text-stone-500 dark:text-stone-400">
                    @if (d.lockedAt) {
                      {{ d.lockedAt | date: 'd MMM, HH:mm' }}
                    } @else {
                      <span class="badge-neutral">Sin bloquear</span>
                    }
                  </td>
                  <td class="text-right">
                    <a [routerLink]="['/juez/torneo', slug(), 'decklists', d.userId]"
                       class="btn-secondary btn-sm"
                       [attr.aria-label]="'Ver decklist de ' + d.playerName">Ver</a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export default class JudgeDecklistsPage implements OnInit {
  readonly slug = input.required<string>();
  private readonly http = inject(HttpClient);
  protected readonly decklists = signal<DecklistRow[]>([]);
  protected readonly missing = signal<MissingRow[]>([]);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ decklists: DecklistRow[]; missing: MissingRow[] }>(
          `/api/judge/tournaments/${this.slug()}/decklists`
        )
      );
      this.decklists.set(res.decklists);
      this.missing.set(res.missing);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }
}
