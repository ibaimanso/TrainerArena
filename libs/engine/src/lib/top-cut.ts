/**
 * Top cut: single-elimination seeding and "fold" advancement (SPEC §7).
 */
import type { MatchOutcome } from './types';

export interface CutPairing {
  bracketPosition: number; // = table number within the cut round
  playerAId: number;
  playerBId: number | null; // null = bye (advance gap)
  isBye: boolean;
}

/** Largest power of 2 ≤ n (0 if n < 2). */
export function largestPowerOfTwoAtMost(n: number): number {
  if (n < 2) return 0;
  let p = 2;
  while (p * 2 <= n) p *= 2;
  return p;
}

/** Smallest power of 2 ≥ n (minimum 1). */
export function smallestPowerOfTwoAtLeast(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Seeds the cut from the final ranking (dropped players already excluded).
 * Effective size S = largest power of 2 ≤ min(configured, ranking length);
 * crosses seed i vs seed (S+1−i) at bracket position i. Null when S < 2
 * (the tournament finishes directly).
 */
export function seedTopCut(
  finalRankingPlayerIds: readonly number[],
  configuredTopCutSize: number
): CutPairing[] | null {
  const size = largestPowerOfTwoAtMost(
    Math.min(configuredTopCutSize, finalRankingPlayerIds.length)
  );
  if (size < 2) return null;
  const pairings: CutPairing[] = [];
  for (let i = 1; i <= size / 2; i++) {
    pairings.push({
      bracketPosition: i,
      playerAId: finalRankingPlayerIds[i - 1],
      playerBId: finalRankingPlayerIds[size - i],
      isBye: false,
    });
  }
  return pairings;
}

export interface ClosedCutMatch {
  bracketPosition: number;
  playerAId: number;
  playerBId: number | null;
  outcome: MatchOutcome; // terminal
}

/** Winner of a terminal match; null for forfeit_both/draw (no winner). */
export function matchWinner(match: ClosedCutMatch): number | null {
  switch (match.outcome) {
    case 'a_wins':
      return match.playerAId;
    case 'b_wins':
      return match.playerBId;
    case 'bye':
      return match.playerAId;
    case 'forfeit_a':
      return match.playerBId;
    case 'forfeit_b':
      return match.playerAId;
    case 'forfeit_both':
    case 'draw':
      return null;
  }
}

export interface CutAdvance {
  /** Next round pairings; empty + finished=true ⇒ tournament over. */
  pairings: CutPairing[];
  finished: boolean;
  /** Champion when the final just closed (null = double forfeit, no champion). */
  championId: number | null;
}

/**
 * Advances the bracket after closing a cut round (SPEC §7):
 * with K positions, winner of position j crosses winner of position K+1−j
 * ("fold"). K = smallest power of 2 ≥ max(match count, max position) to
 * tolerate gaps. One empty side ⇒ bye; both empty ⇒ gap propagates;
 * no winners at all ⇒ finished without champion. K = 1 ⇒ the final closed.
 */
export function advanceTopCut(closedMatches: readonly ClosedCutMatch[]): CutAdvance {
  const maxPosition = Math.max(0, ...closedMatches.map((m) => m.bracketPosition));
  const k = smallestPowerOfTwoAtLeast(Math.max(closedMatches.length, maxPosition));

  const winners = new Map<number, number>();
  for (const match of closedMatches) {
    const winner = matchWinner(match);
    if (winner !== null) winners.set(match.bracketPosition, winner);
  }

  if (k <= 1) {
    // The final just closed.
    return { pairings: [], finished: true, championId: winners.get(1) ?? null };
  }

  if (winners.size === 0) {
    return { pairings: [], finished: true, championId: null };
  }

  const pairings: CutPairing[] = [];
  for (let j = 1; j <= k / 2; j++) {
    const high = winners.get(j) ?? null;
    const low = winners.get(k + 1 - j) ?? null;
    if (high === null && low === null) continue; // gap propagates
    if (high !== null && low !== null) {
      pairings.push({ bracketPosition: j, playerAId: high, playerBId: low, isBye: false });
    } else {
      const survivor = (high ?? low) as number;
      pairings.push({ bracketPosition: j, playerAId: survivor, playerBId: null, isBye: true });
    }
  }

  if (pairings.length === 0) {
    return { pairings: [], finished: true, championId: null };
  }
  return { pairings, finished: false, championId: null };
}
