import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { RoleName } from '@apptorneos/shared';

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  emailVerified: boolean;
  roles: RoleName[];
}

export interface UsersPage {
  users: AdminUser[];
  page: number;
  totalPages: number;
  total: number;
}

/** Superadmin user management (SPEC §12): /api/superadmin/users. */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);

  list(page: number): Promise<UsersPage> {
    return firstValueFrom(
      this.http.get<UsersPage>('/api/superadmin/users', { params: { page } })
    );
  }

  assignRole(userId: number, role: RoleName): Promise<{ ok: true }> {
    return firstValueFrom(
      this.http.post<{ ok: true }>(`/api/superadmin/users/${userId}/roles`, { role })
    );
  }

  revokeRole(userId: number, role: RoleName): Promise<{ ok: true }> {
    return firstValueFrom(
      this.http.post<{ ok: true }>(`/api/superadmin/users/${userId}/roles/revoke`, { role })
    );
  }
}
