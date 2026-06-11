import { DatePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import {
  AdminService,
  type AdminJudgeApplication,
  type AdminRegistration,
} from '../../core/admin.service';

/** Admin: registrations + judge applications of a tournament (SPEC §12). */
@Component({
  imports: [RouterLink, DatePipe],
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="page-title">Registros</h1>
          <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Inscripciones de jugadores y solicitudes de juez del torneo.</p>
        </div>
        <a routerLink="/admin/torneos" class="link text-sm">Volver a mis torneos</a>
      </div>

      @if (error()) {
        <p class="alert-error" role="alert">{{ error() }}</p>
      }

      <nav class="flex w-fit gap-1 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-800 p-1 text-sm shadow-sm"
           aria-label="Tipo de registros">
        <button type="button" (click)="tab.set('registrations')"
                [attr.aria-current]="tab() === 'registrations' ? 'true' : null"
                [class]="tab() === 'registrations' ? 'rounded-md bg-stone-900 px-4 py-2 font-medium text-white' : 'rounded-md px-4 py-2 font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'">
          Inscripciones
        </button>
        <button type="button" (click)="tab.set('judges')"
                [attr.aria-current]="tab() === 'judges' ? 'true' : null"
                [class]="tab() === 'judges' ? 'rounded-md bg-stone-900 px-4 py-2 font-medium text-white' : 'rounded-md px-4 py-2 font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'">
          Solicitudes de juez
        </button>
      </nav>

      @if (tab() === 'registrations') {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Jugador</th>
                <th scope="col">TCG Live</th>
                <th scope="col">Email</th>
                <th scope="col">Estado</th>
                <th scope="col">Inscrito</th>
              </tr>
            </thead>
            <tbody>
              @for (r of registrations(); track r.id) {
                <tr>
                  <td class="font-medium text-stone-900 dark:text-stone-100">{{ r.fullName }}</td>
                  <td class="font-mono text-xs text-stone-700 dark:text-stone-300">{{ r.tcgLiveUsername }}</td>
                  <td><a [href]="'mailto:' + r.email" class="link">{{ r.email }}</a></td>
                  <td>
                    <span [class]="r.status === 'active' ? 'badge-success' : r.status === 'pending_payment' ? 'badge-warning' : 'badge-neutral'">
                      {{ statusLabel(r.status) }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap text-stone-500 dark:text-stone-400">{{ r.registeredAt | date: 'd MMM, HH:mm' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="py-6 text-center text-stone-500 dark:text-stone-400">Sin inscripciones todavía.</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Juez</th>
                <th scope="col">Email</th>
                <th scope="col">Estado</th>
                <th scope="col">Solicitada</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (a of applications(); track a.id) {
                <tr>
                  <td class="font-medium text-stone-900 dark:text-stone-100">{{ a.name }}</td>
                  <td><a [href]="'mailto:' + a.email" class="link">{{ a.email }}</a></td>
                  <td>
                    <span [class]="a.status === 'approved' ? 'badge-success' : a.status === 'pending' ? 'badge-warning' : 'badge-danger'">
                      {{ judgeStatusLabel(a.status) }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap text-stone-500 dark:text-stone-400">{{ a.appliedAt | date: 'd MMM, HH:mm' }}</td>
                  <td>
                    @if (a.status === 'pending') {
                      <div class="flex flex-wrap gap-2">
                        <button type="button" (click)="decide(a, 'approved')" class="btn-success btn-sm">
                          Aprobar
                        </button>
                        <button type="button" (click)="decide(a, 'rejected')" class="btn-danger-outline btn-sm">
                          Rechazar
                        </button>
                      </div>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="py-6 text-center text-stone-500 dark:text-stone-400">Sin solicitudes de juez.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export default class AdminRegistrationsPage implements OnInit {
  readonly slug = input.required<string>();
  private readonly admin = inject(AdminService);

  protected readonly tab = signal<'registrations' | 'judges'>('registrations');
  protected readonly registrations = signal<AdminRegistration[]>([]);
  protected readonly applications = signal<AdminJudgeApplication[]>([]);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const [regs, apps] = await Promise.all([
        this.admin.registrations(this.slug()),
        this.admin.judgeApplications(this.slug()),
      ]);
      this.registrations.set(regs.registrations);
      this.applications.set(apps.applications);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }

  protected statusLabel(status: string): string {
    const labels: Record<string, string> = {
      active: 'Activa',
      pending_payment: 'Pendiente de pago',
      dropped: 'Retirado',
    };
    return labels[status] ?? status;
  }

  protected judgeStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      approved: 'Aprobada',
      rejected: 'Rechazada',
    };
    return labels[status] ?? status;
  }

  protected async decide(a: AdminJudgeApplication, decision: 'approved' | 'rejected'): Promise<void> {
    this.error.set(null);
    try {
      await this.admin.decideJudgeApplication(this.slug(), a.id, decision);
      await this.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }
}
