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
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">Mis torneos</h1>
        <a routerLink="/admin/torneos/crear"
           class="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
          Crear torneo
        </a>
      </div>

      @if (error()) {
        <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
      }

      @if (loading()) {
        <p class="text-sm text-zinc-500">Cargando…</p>
      } @else if (tournaments().length === 0) {
        <p class="rounded-lg bg-white p-6 text-sm text-zinc-500 shadow">
          Todavía no has creado ningún torneo.
        </p>
      } @else {
        <div class="overflow-x-auto rounded-lg bg-white shadow">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-zinc-200 text-xs uppercase text-zinc-500">
              <tr>
                <th class="px-4 py-3">Torneo</th>
                <th class="px-4 py-3">Inicio</th>
                <th class="px-4 py-3">Estado</th>
                <th class="px-4 py-3">Inscritos</th>
                <th class="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (t of tournaments(); track t.slug) {
                <tr class="border-b border-zinc-100">
                  <td class="px-4 py-3 font-medium">{{ t.name }}</td>
                  <td class="px-4 py-3 text-zinc-500">{{ t.startAt | date: 'd MMM y, HH:mm' }}</td>
                  <td class="px-4 py-3">
                    <span class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">{{ statusLabel(t) }}</span>
                  </td>
                  <td class="px-4 py-3">{{ t.activeCount }} / {{ t.maxPlayers }}</td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-2">
                      @if (t.status === 'draft') {
                        <button type="button" (click)="open(t)"
                                class="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500">
                          Abrir inscripciones
                        </button>
                      }
                      @if (t.status === 'registration_open') {
                        <button type="button" (click)="close(t)"
                                class="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-400">
                          Cerrar inscripciones
                        </button>
                      }
                      @if (t.status !== 'draft') {
                        <a [routerLink]="['/torneo', t.slug]"
                           class="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50">Ver pública</a>
                      }
                      <a [routerLink]="['/admin/torneo', t.slug, 'rondas']"
                         class="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50">Rondas</a>
                      <a [routerLink]="['/admin/torneos', t.slug, 'registros']"
                         class="rounded border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50">Registros</a>
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
    this.error.set(null);
    try {
      await this.service.closeRegistration(t.slug);
      await this.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }
}
