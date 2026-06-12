import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { PlayerService, type MyRegistration } from '../../core/player.service';

/** /mi/torneos (SPEC §12): registrations with shortcuts. */
@Component({
  imports: [RouterLink, DatePipe],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="page-title">Mis torneos</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Tus inscripciones y accesos rápidos a cada torneo.</p>
      </div>

      @if (error()) {
        <p class="alert-error" role="alert">{{ error() }}</p>
      }

      @if (loading()) {
        <div class="space-y-3" role="status" aria-label="Cargando tus torneos">
          @for (i of [1, 2]; track i) {
            <div class="card space-y-3">
              <div class="skeleton h-5 w-2/3"></div>
              <div class="skeleton h-4 w-1/3"></div>
            </div>
          }
        </div>
      } @else if (registrations().length === 0) {
        <div class="empty-state">
          <svg class="h-10 w-10 text-stone-300 dark:text-stone-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 21h8M12 17v4" />
            <path d="M7 4h10v6a5 5 0 0 1-10 0V4Z" />
            <path d="M17 5h3a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3M7 5H4a1 1 0 0 0-1 1v1a3 3 0 0 0 3 3" />
          </svg>
          <p>No estás inscrito en ningún torneo.</p>
          <p class="text-xs text-stone-400 dark:text-stone-500">
            Echa un vistazo a los <a routerLink="/" class="link">torneos abiertos</a> e inscríbete.
          </p>
        </div>
      } @else {
        <ul class="space-y-3">
          @for (r of registrations(); track r.tournamentSlug) {
            <li class="card">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <a [routerLink]="['/torneo', r.tournamentSlug]"
                     class="font-semibold text-stone-900 dark:text-stone-100 underline-offset-2 hover:text-indigo-700 hover:underline">
                    {{ r.tournamentName }}
                  </a>
                  <p class="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{{ r.startAt | date: 'd MMM y, HH:mm' }}</p>
                </div>
                <span [class]="badgeClass(r)">{{ statusLabel(r) }}</span>
              </div>
              @if (r.status === 'active') {
                <div class="mt-4 flex flex-wrap gap-2">
                  <a [routerLink]="['/torneo', r.tournamentSlug, 'mi-decklist']"
                     class="btn-secondary btn-sm">Mi decklist</a>
                  <a [routerLink]="['/torneo', r.tournamentSlug, 'match-actual']"
                     class="btn-secondary btn-sm">Mi match</a>
                </div>
              }
            </li>
          }
        </ul>
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
      pending_payment: 'Pendiente de confirmación',
      dropped: 'Retirado',
    };
    return labels[r.status] ?? r.status;
  }

  protected badgeClass(r: MyRegistration): string {
    switch (r.status) {
      case 'active':
        return 'badge-success';
      case 'pending_payment':
        return 'badge-warning';
      default:
        return 'badge-neutral';
    }
  }
}
