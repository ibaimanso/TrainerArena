import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { JudgeApplicationStatus, RegistrationStatus } from '@apptorneos/shared';

export interface AdminRegistration {
  id: number;
  userId: number;
  fullName: string;
  tcgLiveUsername: string;
  email: string;
  phone: string | null;
  status: RegistrationStatus;
  registeredAt: string;
  droppedAt: string | null;
}

export interface AdminJudgeApplication {
  id: number;
  userId: number;
  name: string;
  email: string;
  status: JudgeApplicationStatus;
  appliedAt: string;
  decidedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  registrations(slug: string): Promise<{ registrations: AdminRegistration[] }> {
    return firstValueFrom(
      this.http.get<{ registrations: AdminRegistration[] }>(
        `/api/admin/tournaments/${slug}/registrations`
      )
    );
  }

  confirmRegistration(slug: string, id: number): Promise<{ status: RegistrationStatus }> {
    return firstValueFrom(
      this.http.post<{ status: RegistrationStatus }>(
        `/api/admin/tournaments/${slug}/registrations/${id}/confirm`,
        {}
      )
    );
  }

  rejectRegistration(slug: string, id: number): Promise<{ ok: true }> {
    return firstValueFrom(
      this.http.post<{ ok: true }>(
        `/api/admin/tournaments/${slug}/registrations/${id}/reject`,
        {}
      )
    );
  }

  judgeApplications(slug: string): Promise<{ applications: AdminJudgeApplication[] }> {
    return firstValueFrom(
      this.http.get<{ applications: AdminJudgeApplication[] }>(
        `/api/admin/tournaments/${slug}/judge-applications`
      )
    );
  }

  decideJudgeApplication(
    slug: string,
    id: number,
    decision: 'approved' | 'rejected'
  ): Promise<{ status: JudgeApplicationStatus }> {
    return firstValueFrom(
      this.http.post<{ status: JudgeApplicationStatus }>(
        `/api/admin/tournaments/${slug}/judge-applications/${id}/decide`,
        { decision }
      )
    );
  }
}
