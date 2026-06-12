import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RecaptchaService } from './recaptcha.service';
import type {
  JudgeApplicationStatus,
  RegistrationStatus,
  TournamentStatus,
} from '@apptorneos/shared';

export interface MyRegistration {
  tournamentSlug: string;
  tournamentName: string;
  tournamentStatus: TournamentStatus;
  startAt: string;
  status: RegistrationStatus;
  registeredAt: string;
}

export interface ParsedCard {
  quantity: number;
  name: string;
  set: string;
  number: string;
}

export interface ParsedDecklist {
  pokemon: ParsedCard[];
  trainer: ParsedCard[];
  energy: ParsedCard[];
  total: number;
}

export interface DecklistView {
  rawText: string;
  parsed: ParsedDecklist;
  submittedAt: string;
  lockedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private readonly http = inject(HttpClient);
  private readonly recaptcha = inject(RecaptchaService);

  async register(
    slug: string,
    data: { fullName: string; tcgLiveUsername: string; email: string; phone?: string }
  ): Promise<{ status: string }> {
    const headers = await this.recaptcha.headers('inscripcion_torneo');
    return firstValueFrom(
      this.http.post<{ status: string }>(`/api/tournaments/${slug}/register`, data, { headers })
    );
  }

  drop(slug: string): Promise<{ status: string }> {
    return firstValueFrom(this.http.post<{ status: string }>(`/api/tournaments/${slug}/drop`, {}));
  }

  myRegistrations(): Promise<{ registrations: MyRegistration[] }> {
    return firstValueFrom(
      this.http.get<{ registrations: MyRegistration[] }>('/api/my/registrations')
    );
  }

  myDecklist(slug: string): Promise<{ decklist: DecklistView | null; canEdit: boolean }> {
    return firstValueFrom(
      this.http.get<{ decklist: DecklistView | null; canEdit: boolean }>(
        `/api/tournaments/${slug}/my-decklist`
      )
    );
  }

  saveDecklist(slug: string, rawText: string): Promise<{ decklist: DecklistView }> {
    return firstValueFrom(
      this.http.put<{ decklist: DecklistView }>(`/api/tournaments/${slug}/my-decklist`, { rawText })
    );
  }

  applyAsJudge(slug: string): Promise<{ status: JudgeApplicationStatus }> {
    return firstValueFrom(
      this.http.post<{ status: JudgeApplicationStatus }>(
        `/api/tournaments/${slug}/judge-application`,
        {}
      )
    );
  }
}
