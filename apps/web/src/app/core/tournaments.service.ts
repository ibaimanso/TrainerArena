import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  JudgeApplicationStatus,
  RegistrationStatus,
  TournamentStatus,
} from '@apptorneos/shared';

export interface TournamentSummary {
  slug: string;
  publicId: string;
  name: string;
  startAt: string;
  status: TournamentStatus;
  maxPlayers: number;
  activeCount: number;
  feeAmount: number;
  feeCurrency: string;
  swissRounds: number;
  swissBo: number;
  topCutBo: number;
  topCutSize: number;
  roundTimeMinutes: number;
  checkinMinutes: number;
}

export interface TournamentDetail extends TournamentSummary {
  description: string | null;
}

export interface ViewerContext {
  isAuthenticated: boolean;
  isVerified: boolean;
  isTournamentAdmin: boolean;
  registrationStatus: RegistrationStatus | null;
  isFull: boolean;
  canRegister: boolean;
  hasJudgeRole: boolean;
  judgeApplicationStatus: JudgeApplicationStatus | null;
  isApprovedJudge: boolean;
}

export interface LandingData {
  open: TournamentSummary[];
  ongoing: TournamentSummary[];
  finished: TournamentSummary[];
}

export interface CreateTournamentPayload {
  name: string;
  description?: string;
  startAt: string;
  maxPlayers: number;
  swissRounds: number;
  roundTimeMinutes: number;
  checkinMinutes: number;
  swissBo: number;
  topCutBo: number;
  topCutSize: number;
  feeAmount: number;
  paypalAccount?: string;
}

export interface AdminTournament extends TournamentSummary {
  description: string | null;
}

@Injectable({ providedIn: 'root' })
export class TournamentsService {
  private readonly http = inject(HttpClient);

  landing(): Promise<LandingData> {
    return firstValueFrom(this.http.get<LandingData>('/api/tournaments'));
  }

  detail(slug: string): Promise<{ tournament: TournamentDetail; viewer: ViewerContext }> {
    return firstValueFrom(
      this.http.get<{ tournament: TournamentDetail; viewer: ViewerContext }>(
        `/api/tournaments/${slug}`
      )
    );
  }

  adminList(): Promise<{ tournaments: AdminTournament[] }> {
    return firstValueFrom(this.http.get<{ tournaments: AdminTournament[] }>('/api/admin/tournaments'));
  }

  adminDetail(slug: string): Promise<{ tournament: AdminTournament }> {
    return firstValueFrom(
      this.http.get<{ tournament: AdminTournament }>(`/api/admin/tournaments/${slug}`)
    );
  }

  create(payload: CreateTournamentPayload): Promise<{ tournament: AdminTournament }> {
    return firstValueFrom(
      this.http.post<{ tournament: AdminTournament }>('/api/admin/tournaments', payload)
    );
  }

  openRegistration(slug: string): Promise<{ tournament: AdminTournament }> {
    return firstValueFrom(
      this.http.post<{ tournament: AdminTournament }>(
        `/api/admin/tournaments/${slug}/open-registration`,
        {}
      )
    );
  }

  closeRegistration(slug: string): Promise<{ tournament: AdminTournament }> {
    return firstValueFrom(
      this.http.post<{ tournament: AdminTournament }>(
        `/api/admin/tournaments/${slug}/close-registration`,
        {}
      )
    );
  }
}

export const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: 'Borrador',
  registration_open: 'Inscripciones abiertas',
  registration_closed: 'Inscripciones cerradas',
  in_progress: 'En curso',
  finished: 'Terminado',
  cancelled: 'Cancelado',
};
