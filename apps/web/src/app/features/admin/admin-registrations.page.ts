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
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">Registros</h1>
        <a routerLink="/admin/torneos" class="text-sm text-indigo-600 hover:underline">Volver a mis torneos</a>
      </div>

      @if (error()) {
        <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
      }

      <nav class="flex gap-1 rounded-lg bg-white p-1 shadow w-fit text-sm">
        <button type="button" (click)="tab.set('registrations')"
                [class]="tab() === 'registrations' ? 'rounded bg-indigo-600 px-4 py-2 font-medium text-white' : 'rounded px-4 py-2 font-medium hover:bg-indigo-50'">
          Inscripciones
        </button>
        <button type="button" (click)="tab.set('judges')"
                [class]="tab() === 'judges' ? 'rounded bg-indigo-600 px-4 py-2 font-medium text-white' : 'rounded px-4 py-2 font-medium hover:bg-indigo-50'">
          Solicitudes de juez
        </button>
      </nav>

      @if (tab() === 'registrations') {
        <div class="overflow-x-auto rounded-lg bg-white shadow">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-zinc-200 text-xs uppercase text-zinc-500">
              <tr>
                <th class="px-4 py-3">Jugador</th>
                <th class="px-4 py-3">TCG Live</th>
                <th class="px-4 py-3">Email</th>
                <th class="px-4 py-3">Estado</th>
                <th class="px-4 py-3">Inscrito</th>
              </tr>
            </thead>
            <tbody>
              @for (r of registrations(); track r.id) {
                <tr class="border-b border-zinc-100">
                  <td class="px-4 py-3 font-medium">{{ r.fullName }}</td>
                  <td class="px-4 py-3">{{ r.tcgLiveUsername }}</td>
                  <td class="px-4 py-3 text-zinc-500">{{ r.email }}</td>
                  <td class="px-4 py-3">
                    <span class="rounded-full px-2 py-0.5 text-xs"
                          [class]="r.status === 'active' ? 'bg-green-50 text-green-700' : r.status === 'pending_payment' ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-600'">
                      {{ statusLabel(r.status) }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-zinc-500">{{ r.registeredAt | date: 'd MMM, HH:mm' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="px-4 py-6 text-center text-zinc-500">Sin inscripciones todavía.</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="overflow-x-auto rounded-lg bg-white shadow">
          <table class="w-full text-left text-sm">
            <thead class="border-b border-zinc-200 text-xs uppercase text-zinc-500">
              <tr>
                <th class="px-4 py-3">Juez</th>
                <th class="px-4 py-3">Email</th>
                <th class="px-4 py-3">Estado</th>
                <th class="px-4 py-3">Solicitada</th>
                <th class="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (a of applications(); track a.id) {
                <tr class="border-b border-zinc-100">
                  <td class="px-4 py-3 font-medium">{{ a.name }}</td>
                  <td class="px-4 py-3 text-zinc-500">{{ a.email }}</td>
                  <td class="px-4 py-3">
                    <span class="rounded-full px-2 py-0.5 text-xs"
                          [class]="a.status === 'approved' ? 'bg-green-50 text-green-700' : a.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-600'">
                      {{ judgeStatusLabel(a.status) }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-zinc-500">{{ a.appliedAt | date: 'd MMM, HH:mm' }}</td>
                  <td class="px-4 py-3">
                    @if (a.status === 'pending') {
                      <div class="flex gap-2">
                        <button type="button" (click)="decide(a, 'approved')"
                                class="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-500">Aprobar</button>
                        <button type="button" (click)="decide(a, 'rejected')"
                                class="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500">Rechazar</button>
                      </div>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="px-4 py-6 text-center text-zinc-500">Sin solicitudes de juez.</td></tr>
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
