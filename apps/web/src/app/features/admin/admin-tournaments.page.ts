import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import {
  STATUS_LABELS,
  TournamentsService,
  type AdminTournament,
} from '../../core/tournaments.service';

/** Admin tournament list (SPEC §12 /admin/torneos). */
@Component({
  imports: [RouterLink, DatePipe],
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="page-title">Mis torneos</h1>
          <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Gestiona inscripciones, rondas y registros de tus torneos.</p>
        </div>
        <a routerLink="/admin/torneos/crear" class="btn-primary">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Crear torneo
        </a>
      </div>

      @if (error()) {
        <p class="alert-error" role="alert">{{ error() }}</p>
      }

      @if (loading()) {
        <div class="card space-y-3" aria-label="Cargando torneos">
          <div class="skeleton h-5 w-2/3"></div>
          <div class="skeleton h-5 w-1/2"></div>
          <div class="skeleton h-5 w-3/5"></div>
        </div>
      } @else if (tournaments().length === 0) {
        <div class="empty-state">
          <svg class="h-10 w-10 text-stone-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4Z" />
            <path d="M7 6H4a1 1 0 0 0-1 1 4 4 0 0 0 4 4M17 6h3a1 1 0 0 1 1 1 4 4 0 0 1-4 4" />
          </svg>
          <p>Todavía no has creado ningún torneo.</p>
          <p class="text-xs text-stone-400 dark:text-stone-500">Empieza con el botón «Crear torneo» de arriba.</p>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Torneo</th>
                <th scope="col">Inicio</th>
                <th scope="col">Estado</th>
                <th scope="col">Inscritos</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (t of tournaments(); track t.slug) {
                <tr>
                  <td class="font-medium text-stone-900 dark:text-stone-100">{{ t.name }}</td>
                  <td class="whitespace-nowrap text-stone-500 dark:text-stone-400">{{ t.startAt | date: 'd MMM y, HH:mm' }}</td>
                  <td>
                    <span [class]="t.status === 'registration_open' ? 'badge-success'
                            : t.status === 'registration_closed' ? 'badge-warning'
                            : t.status === 'in_progress' ? 'badge-brand'
                            : t.status === 'cancelled' ? 'badge-danger'
                            : 'badge-neutral'">
                      {{ statusLabel(t) }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap">{{ t.activeCount }} / {{ t.maxPlayers }}</td>
                  <td>
                    <div class="flex flex-wrap gap-2">
                      @if (t.status === 'draft') {
                        <button type="button" (click)="open(t)" class="btn-primary btn-sm">
                          Abrir inscripciones
                        </button>
                      }
                      @if (t.status === 'registration_open') {
                        <button type="button" (click)="close(t)" class="btn-warning btn-sm">
                          Cerrar inscripciones
                        </button>
                      }
                      @if (t.status === 'registration_closed') {
                        <button type="button" (click)="reopen(t)" class="btn-secondary btn-sm">
                          Reabrir inscripciones
                        </button>
                      }
                      @if (t.status !== 'draft') {
                        <a [routerLink]="['/torneo', t.slug]" class="btn-secondary btn-sm">Ver pública</a>
                      }
                      <a [routerLink]="['/admin/torneo', t.slug, 'rondas']" class="btn-secondary btn-sm">Rondas</a>
                      <a [routerLink]="['/admin/torneos', t.slug, 'registros']" class="btn-secondary btn-sm">Registros</a>
                      @if (t.status !== 'in_progress') {
                        <button type="button" (click)="remove(t)" class="btn-danger-outline btn-sm"
                                [attr.aria-label]="'Eliminar el torneo ' + t.name">
                          Eliminar
                        </button>
                      }
                    </div>
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
export default class AdminTournamentsPage implements OnInit {
  private readonly service = inject(TournamentsService);
  protected readonly tournaments = signal<AdminTournament[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.service.adminList();
      this.tournaments.set(res.tournaments);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected statusLabel(t: AdminTournament): string {
    return STATUS_LABELS[t.status] ?? t.status;
  }

  protected async open(t: AdminTournament): Promise<void> {
    this.error.set(null);
    try {
      await this.service.openRegistration(t.slug);
      await this.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected async close(t: AdminTournament): Promise<void> {
    const confirmed = window.confirm(
      `¿Cerrar las inscripciones de «${t.name}»?\n\nLos jugadores ya no podrán inscribirse. ` +
        'Podrás reabrirlas mientras no se hayan generado rondas.'
    );
    if (!confirmed) return;
    this.error.set(null);
    try {
      await this.service.closeRegistration(t.slug);
      await this.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected async reopen(t: AdminTournament): Promise<void> {
    this.error.set(null);
    try {
      await this.service.reopenRegistration(t.slug);
      await this.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected async remove(t: AdminTournament): Promise<void> {
    const confirmed = window.confirm(
      `¿Eliminar el torneo «${t.name}»?\n\nEsta acción no se puede deshacer: el torneo ` +
        'desaparecerá de la web junto a sus inscripciones y resultados.'
    );
    if (!confirmed) return;
    this.error.set(null);
    try {
      await this.service.delete(t.slug);
      await this.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }
}
