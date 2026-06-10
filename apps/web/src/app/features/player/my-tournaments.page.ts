import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { PlayerService, type MyRegistration } from '../../core/player.service';

/** /mi/torneos (SPEC §12): registrations with shortcuts. */
@Component({
  imports: [RouterLink, DatePipe],
  template: `
    <div class="space-y-4">
      <h1 class="text-2xl font-bold">Mis torneos</h1>

      @if (error()) {
        <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
      }

      @if (loading()) {
        <p class="text-sm text-zinc-500">Cargando…</p>
      } @else if (registrations().length === 0) {
        <div class="rounded-lg bg-white p-6 text-sm text-zinc-500 shadow">
          No estás inscrito en ningún torneo.
          <a routerLink="/" class="ml-1 text-indigo-600 hover:underline">Ver torneos abiertos</a>
        </div>
      } @else {
        <div class="space-y-3">
          @for (r of registrations(); track r.tournamentSlug) {
            <div class="rounded-lg bg-white p-4 shadow">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <a [routerLink]="['/torneo', r.tournamentSlug]" class="font-semibold hover:underline">
                    {{ r.tournamentName }}
                  </a>
                  <p class="text-sm text-zinc-500">{{ r.startAt | date: 'd MMM y, HH:mm' }}</p>
                </div>
                <span class="rounded-full px-2 py-0.5 text-xs font-medium"
                      [class]="badgeClass(r)">
                  {{ statusLabel(r) }}
                </span>
              </div>
              @if (r.status === 'active') {
                <div class="mt-3 flex flex-wrap gap-2 text-sm">
                  <a [routerLink]="['/torneo', r.tournamentSlug, 'mi-decklist']"
                     class="rounded border border-indigo-200 px-3 py-1 text-indigo-700 hover:bg-indigo-50">Mi decklist</a>
                  <a [routerLink]="['/torneo', r.tournamentSlug, 'match-actual']"
                     class="rounded border border-indigo-200 px-3 py-1 text-indigo-700 hover:bg-indigo-50">Mi match</a>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export default class MyTournamentsPage implements OnInit {
  private readonly player = inject(PlayerService);
  protected readonly registrations = signal<MyRegistration[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.player.myRegistrations();
      this.registrations.set(res.registrations);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected statusLabel(r: MyRegistration): string {
    const labels: Record<string, string> = {
      active: 'Inscrito',
      pending_payment: 'Pendiente de pago',
      dropped: 'Retirado',
    };
    return labels[r.status] ?? r.status;
  }

  protected badgeClass(r: MyRegistration): string {
    switch (r.status) {
      case 'active':
        return 'bg-green-50 text-green-700';
      case 'pending_payment':
        return 'bg-amber-50 text-amber-700';
      default:
        return 'bg-zinc-100 text-zinc-600';
    }
  }
}
