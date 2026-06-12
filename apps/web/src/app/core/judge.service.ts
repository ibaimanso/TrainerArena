import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { JudgeCallStatus } from '@apptorneos/shared';

export interface QueueCall {
  id: number;
  status: JudgeCallStatus;
  tournamentSlug: string;
  tournamentName: string;
  tableNumber: number;
  createdBy: { id: number; name: string };
  assignedJudge: { id: number; name: string } | null;
  createdAt: string;
}

export interface QueueDispute {
  matchId: number;
  tournamentSlug: string;
  tournamentName: string;
  roundNumber: number;
  tableNumber: number;
  playerA: { id: number; name: string };
  playerB: { id: number; name: string } | null;
}

export interface CallMessage {
  id: number;
  sender: { id: number; name: string };
  message: string;
  sentAt: string;
}

export interface CallDetail {
  id: number;
  status: JudgeCallStatus;
  createdById: number;
  assignedJudge: { id: number; name: string } | null;
  resolvedAt: string | null;
  tournamentSlug?: string;
  tournamentName?: string;
  tableNumber?: number;
  roundNumber?: number;
  playerA?: { id: number; name: string };
  playerB?: { id: number; name: string } | null;
}

export interface DisputeDetail {
  match: {
    id: number;
    tableNumber: number;
    roundNumber: number;
    tournamentSlug: string;
    tournamentName: string;
    playerA: { id: number; name: string } | null;
    playerB: { id: number; name: string } | null;
  };
  reports: Array<{
    reporter: { id: number; name: string };
    result: string;
    score: string | null;
    reportedAt: string;
  }>;
}

export interface TablePlayer {
  id: number;
  name: string;
  tcgLiveUsername: string | null;
}

export interface RoundTable {
  id: number;
  tableNumber: number;
  status: string;
  isBye: boolean;
  playerA: TablePlayer | null;
  playerB: TablePlayer | null;
  checkInA: string | null;
  checkInB: string | null;
  reports: Array<{
    reporter: { id: number; name: string };
    result: string;
    score: string | null;
    reportedAt: string;
  }>;
  result: { result: string; winnerId: number | null; score: string | null } | null;
}

export interface RoundTables {
  tournament: { slug: string; name: string };
  round: {
    id: number;
    roundNumber: number;
    phase: string;
    status: string;
    endsAt: string | null;
    bestOf: number;
  };
  matches: RoundTable[];
  serverNow: string;
}

export type ForceOutcome = 'a_wins' | 'b_wins' | 'draw' | 'forfeit_a' | 'forfeit_b' | 'forfeit_both';

@Injectable({ providedIn: 'root' })
export class JudgeService {
  private readonly http = inject(HttpClient);

  tables(slug: string): Promise<RoundTables> {
    return firstValueFrom(this.http.get<RoundTables>(`/api/judge/tournaments/${slug}/tables`));
  }

  forceResult(matchId: number, result: ForceOutcome, score?: string): Promise<{ ok: true }> {
    return firstValueFrom(
      this.http.post<{ ok: true }>(`/api/judge/matches/${matchId}/force-result`, {
        result,
        score: score || undefined,
      })
    );
  }

  createCall(matchId: number): Promise<{ call: { id: number; status: JudgeCallStatus } }> {
    return firstValueFrom(
      this.http.post<{ call: { id: number; status: JudgeCallStatus } }>(
        `/api/matches/${matchId}/judge-call`,
        {}
      )
    );
  }

  queue(): Promise<{ calls: QueueCall[]; disputes: QueueDispute[] }> {
    return firstValueFrom(
      this.http.get<{ calls: QueueCall[]; disputes: QueueDispute[] }>('/api/judge/queue')
    );
  }

  callDetail(id: number): Promise<{ call: CallDetail; messages: CallMessage[] }> {
    return firstValueFrom(
      this.http.get<{ call: CallDetail; messages: CallMessage[] }>(`/api/judge/calls/${id}`)
    );
  }

  take(id: number): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/judge/calls/${id}/take`, {}));
  }

  sendMessage(id: number, message: string): Promise<{ message: CallMessage }> {
    return firstValueFrom(
      this.http.post<{ message: CallMessage }>(`/api/judge/calls/${id}/messages`, { message })
    );
  }

  resolve(id: number): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/judge/calls/${id}/resolve`, {}));
  }

  dispute(matchId: number): Promise<DisputeDetail> {
    return firstValueFrom(this.http.get<DisputeDetail>(`/api/judge/disputes/${matchId}`));
  }

  resolveDispute(matchId: number, result: string, score?: string): Promise<unknown> {
    return firstValueFrom(
      this.http.post(`/api/judge/disputes/${matchId}/resolve`, { result, score: score || undefined })
    );
  }
}
