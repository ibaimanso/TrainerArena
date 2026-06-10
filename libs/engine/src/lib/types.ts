/**
 * Immutable tournament snapshot consumed by the pure engines (SPEC §5).
 * No Prisma/Nest/Angular imports — plain data in, deterministic results out.
 */
/** Terminal match outcomes (mirrors shared/Prisma enum values 1:1). */
export type MatchOutcome =
  | 'a_wins'
  | 'b_wins'
  | 'draw'
  | 'bye'
  | 'forfeit_a'
  | 'forfeit_b'
  | 'forfeit_both';

export interface PlayerSnapshot {
  id: number;
  dropped: boolean;
  /** Round the player still plays after dropping (SPEC §6.9); null if not dropped or dropped pre-start. */
  droppedAfterRoundNumber: number | null;
}

export interface MatchSnapshot {
  roundNumber: number;
  tableNumber: number;
  playerAId: number;
  playerBId: number | null; // null = bye
  /** Only terminal matches carry an outcome. */
  outcome: MatchOutcome;
  /** ISO timestamp; null when unknown. */
  finishedAt: string | null;
}

export interface TournamentSnapshot {
  pairingSeed: string;
  currentRoundNumber: number;
  players: PlayerSnapshot[];
  matches: MatchSnapshot[];
}

/** Active player for round N: not dropped, or dropped with droppedAfterRoundNumber >= N. */
export function activePlayersForRound(
  players: readonly PlayerSnapshot[],
  roundNumber: number
): PlayerSnapshot[] {
  return players.filter(
    (p) =>
      !p.dropped ||
      (p.droppedAfterRoundNumber !== null && p.droppedAfterRoundNumber >= roundNumber)
  );
}

export interface Pairing {
  tableNumber: number;
  playerAId: number;
  playerBId: number;
}

export interface PairingPlan {
  pairings: Pairing[];
  /** Player receiving the bye this round, if any. */
  byePlayerId: number | null;
}

/** Thrown when a group cannot be paired without rematches (SPEC §5.3.6). */
export class ManualPairingRequired extends Error {
  constructor(
    /** Valid pairings already produced (preserved for the manual pairing UI). */
    public readonly partialPairings: Pairing[],
    /** Players left without table (excluding the bye). */
    public readonly unpairedPlayerIds: number[],
    public readonly byePlayerId: number | null
  ) {
    super('No se pudo completar el pareo automático sin repetir cruces.');
    this.name = 'ManualPairingRequired';
  }
}
