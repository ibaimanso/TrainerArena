import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  MatchStatus,
  ReportResult,
  RoundPhase,
  RoundStatus,
  TournamentStatus,
} from '@apptorneos/shared';

export interface AdminRound {
  id: number;
  roundNumber: number;
  phase: RoundPhase;
  status: RoundStatus;
  startedAt: string | null;
  endsAt: string | null;
  closedAt: string | null;
  matchCounts: Record<string, number>;
  totalMatches: number;
}

export interface ManualPairingState {
  round: { id: number; roundNumber: number; phase: RoundPhase; status: RoundStatus };
  matches: Array<{
    tableNumber: number;
    playerA: { id: number; name: string };
    playerB: { id: number; name: string } | null;
    isBye: boolean;
    status: MatchStatus;
  }>;
  unpaired: Array<{ id: number; name: string }>;
}

export interface MyMatch {
  id: number;
  tableNumber: number;
  status: MatchStatus;
  roundNumber: number;
  phase: RoundPhase;
  endsAt: string | null;
  roundStatus: RoundStatus;
  checkInDeadline: string | null;
  opponent: { id: number; name: string; tcgLiveUsername: string | null } | null;
  myTcgLiveUsername: string | null;
  myCheckIn: string | null;
  opponentCheckIn: string | null;
  myReport: { result: ReportResult; score: string | null } | null;
  result: { result: string; winnerId: number | null; score: string | null } | null;
  bestOf: number;
  judgeCall: {
    id: number;
    status: string;
    assignedJudge: { id: number; name: string } | null;
  } | null;
}

/** Registered player, tournament not started yet (no current round). */
export interface MyMatchNotStarted {
  name: string;
  startAt: string;
  status: TournamentStatus;
}

export interface MatchMessage {
  id: number;
  sender: { id: number; name: string };
  message: string;
  sentAt: string;
}

@Injectable({ providedIn: 'root' })
export class RoundsService {
  private readonly http = inject(HttpClient);

  adminRounds(slug: string): Promise<{
    rounds: AdminRound[];
    swissRounds: number;
    topCutSize: number;
    tournamentStatus: TournamentStatus;
  }> {
    return firstValueFrom(
      this.http.get<{
        rounds: AdminRound[];
        swissRounds: number;
        topCutSize: number;
        tournamentStatus: TournamentStatus;
      }>(`/api/admin/tournaments/${slug}/rounds`)
    );
  }

  generate(slug: string): Promise<{ roundId: number; manualRequired: boolean; manualMessage: string | null }> {
    return firstValueFrom(
      this.http.post<{ roundId: number; manualRequired: boolean; manualMessage: string | null }>(
        `/api/admin/tournaments/${slug}/rounds/generate`,
        {}
      )
    );
  }

  start(roundId: number): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/admin/rounds/${roundId}/start`, {}));
  }

  close(roundId: number): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/admin/rounds/${roundId}/close`, {}));
  }

  manualState(roundId: number): Promise<ManualPairingState> {
    return firstValueFrom(
      this.http.get<ManualPairingState>(`/api/admin/rounds/${roundId}/manual-pairing`)
    );
  }

  manualPair(
    roundId: number,
    playerAId: number,
    playerBId: number | null,
    allowRematch = false
  ): Promise<ManualPairingState> {
    return firstValueFrom(
      this.http.post<ManualPairingState>(`/api/admin/rounds/${roundId}/manual-pairing`, {
        playerAId,
        playerBId,
        allowRematch,
      })
    );
  }

  myMatch(slug: string): Promise<{
    match: MyMatch | null;
    notStarted?: MyMatchNotStarted;
    serverNow: string;
  }> {
    return firstValueFrom(
      this.http.get<{ match: MyMatch | null; notStarted?: MyMatchNotStarted; serverNow: string }>(
        `/api/tournaments/${slug}/my-match`
      )
    );
  }

  matchMessages(matchId: number): Promise<{ readOnly: boolean; messages: MatchMessage[] }> {
    return firstValueFrom(
      this.http.get<{ readOnly: boolean; messages: MatchMessage[] }>(
        `/api/matches/${matchId}/messages`
      )
    );
  }

  sendMatchMessage(matchId: number, message: string): Promise<{ message: MatchMessage }> {
    return firstValueFrom(
      this.http.post<{ message: MatchMessage }>(`/api/matches/${matchId}/messages`, { message })
    );
  }

  checkIn(matchId: number): Promise<unknown> {
    return firstValueFrom(this.http.post(`/api/matches/${matchId}/checkin`, {}));
  }

  report(matchId: number, result: ReportResult, score?: string): Promise<unknown> {
    return firstValueFrom(
      this.http.post(`/api/matches/${matchId}/report`, { result, score: score || undefined })
    );
  }
}
