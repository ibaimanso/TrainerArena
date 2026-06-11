import { LowerCasePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import type { RoleName } from '@apptorneos/shared';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { UsersService, type AdminUser } from '../../core/users.service';

const ROLE_LABELS: Record<RoleName, string> = {
  superadmin: 'Superadmin',
  admin: 'Organizador',
  judge: 'Juez',
  player: 'Jugador',
};

/** /superadmin/usuarios (SPEC §12): paginated users, assign/revoke admin and judge. */
@Component({
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="page-title">Usuarios</h1>
          <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Asigna o retira los roles de organizador y juez.</p>
        </div>
        @if (!loading()) {
          <p class="text-sm text-stone-500 dark:text-stone-400" role="status">{{ total() }} usuarios</p>
        }
      </div>

      @if (error()) {
        <p class="alert-error" role="alert">{{ error() }}</p>
      }

      @if (loading()) {
        <div class="card space-y-3" aria-label="Cargando usuarios">
          <div class="skeleton h-5 w-2/3"></div>
          <div class="skeleton h-5 w-1/2"></div>
          <div class="skeleton h-5 w-3/5"></div>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col">Email</th>
                <th scope="col">Roles</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr>
                  <td class="font-medium text-stone-900 dark:text-stone-100">
                    {{ u.name }}
                    @if (u.id === auth.user()?.id) {
                      <span class="ml-1 text-xs text-stone-400 dark:text-stone-500">(tú)</span>
                    }
                  </td>
                  <td class="text-stone-500 dark:text-stone-400">
                    {{ u.email }}
                    @if (!u.emailVerified) {
                      <span class="badge-warning ml-1">Sin verificar</span>
                    }
                  </td>
                  <td>
                    <div class="flex flex-wrap gap-1">
                      @for (role of u.roles; track role) {
                        <span [class]="role === 'superadmin' ? 'badge-brand' : 'badge-neutral'">
                          {{ roleLabel(role) }}
                        </span>
                      }
                    </div>
                  </td>
                  <td>
                    @if (u.id !== auth.user()?.id) {
                      <div class="flex flex-wrap gap-2">
                        @for (role of managedRoles; track role) {
                          @if (u.roles.includes(role)) {
                            <button type="button" (click)="revoke(u, role)" [disabled]="busy()"
                                    class="btn-danger-outline btn-sm">
                              Quitar {{ roleLabel(role) | lowercase }}
                            </button>
                          } @else {
                            <button type="button" (click)="assign(u, role)" [disabled]="busy()"
                                    class="btn-secondary btn-sm">
                              Hacer {{ roleLabel(role) | lowercase }}
                            </button>
                          }
                        }
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (totalPages() > 1) {
          <nav class="flex items-center justify-center gap-3 text-sm" aria-label="Paginación">
            <button type="button" (click)="goTo(page() - 1)" [disabled]="page() <= 1 || busy()"
                    class="btn-secondary btn-sm">
              Anterior
            </button>
            <span class="text-stone-500 dark:text-stone-400" role="status">Página {{ page() }} de {{ totalPages() }}</span>
            <button type="button" (click)="goTo(page() + 1)" [disabled]="page() >= totalPages() || busy()"
                    class="btn-secondary btn-sm">
              Siguiente
            </button>
          </nav>
        }
      }
    </div>
  `,
  imports: [LowerCasePipe],
})
export default class UsersPage implements OnInit {
  private readonly service = inject(UsersService);
  protected readonly auth = inject(AuthService);

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Only admin and judge are grantable/revocable from this screen (SPEC §12). */
  protected readonly managedRoles: RoleName[] = ['admin', 'judge'];

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  protected roleLabel(role: RoleName): string {
    return ROLE_LABELS[role] ?? role;
  }

  protected async goTo(page: number): Promise<void> {
    this.page.set(page);
    this.loading.set(true);
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const res = await this.service.list(this.page());
      this.users.set(res.users);
      this.page.set(res.page);
      this.totalPages.set(res.totalPages);
      this.total.set(res.total);
      this.error.set(null);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected async assign(user: AdminUser, role: RoleName): Promise<void> {
    await this.mutate(() => this.service.assignRole(user.id, role));
  }

  protected async revoke(user: AdminUser, role: RoleName): Promise<void> {
    await this.mutate(() => this.service.revokeRole(user.id, role));
  }

  private async mutate(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      await this.reload();
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
