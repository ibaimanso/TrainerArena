/**
 * Swiss pairing (SPEC §5.2 round 1, §5.3 Monrad/Dutch for rounds 2+).
 */
import { seededShuffle } from './rng';
import { computeStandings, type StandingEntry } from './standings';
import {
  activePlayersForRound,
  ManualPairingRequired,
  type Pairing,
  type PairingPlan,
  type TournamentSnapshot,
} from './types';

/** Round 1 (SPEC §5.2): reproducible shuffle by "{seed}:round:1"; if odd, the last after shuffling gets the bye. */
export function pairRound1(snapshot: TournamentSnapshot): PairingPlan {
  const active = activePlayersForRound(snapshot.players, 1)
    .map((p) => p.id)
    .sort((a, b) => a - b);
  const shuffled = seededShuffle(active, `${snapshot.pairingSeed}:round:1`);

  let byePlayerId: number | null = null;
  if (shuffled.length % 2 === 1) {
    byePlayerId = shuffled.pop() ?? null;
  }

  const pairings: Pairing[] = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    pairings.push({
      tableNumber: pairings.length + 1,
      playerAId: shuffled[i],
      playerBId: shuffled[i + 1],
    });
  }
  return { pairings, byePlayerId };
}

/** Normalized rematch key (low < high, SPEC §3 pairing_history). */
export function pairKey(playerA: number, playerB: number): string {
  return playerA < playerB ? `${playerA}:${playerB}` : `${playerB}:${playerA}`;
}

/** Set of normalized "low:high" keys of pairs that already played each other. */
export type PairingHistory = ReadonlySet<string>;

const BACKTRACK_LIMIT = 40320; // 8!

/**
 * Tries to pair a group UH[i] vs LH[i]; on rematches, deterministically tests
 * permutations of LH in generation order with a global cap of 8! attempts.
 * Returns the pairs (in UH order) or null when impossible within the limit.
 */
function pairGroup(
  group: readonly number[],
  history: PairingHistory
): Array<[number, number]> | null {
  const half = group.length / 2;
  const upper = group.slice(0, half);
  const lower = group.slice(half);

  let attempts = 0;
  const used = new Array<boolean>(lower.length).fill(false);
  const assignment = new Array<number>(upper.length).fill(-1);

  // Lexicographic permutations of LH indices; each completed permutation counts
  // as one attempt against the 40320 cap (partial branches pruned early).
  const backtrack = (position: number): boolean => {
    if (attempts >= BACKTRACK_LIMIT) return false;
    if (position === upper.length) {
      attempts++;
      return true;
    }
    for (let j = 0; j < lower.length; j++) {
      if (used[j]) continue;
      if (history.has(pairKey(upper[position], lower[j]))) {
        continue;
      }
      used[j] = true;
      assignment[position] = j;
      if (backtrack(position + 1)) return true;
      used[j] = false;
      assignment[position] = -1;
      if (attempts >= BACKTRACK_LIMIT) return false;
    }
    return false;
  };

  if (!backtrack(0)) return null;
  return upper.map((playerA, i) => [playerA, lower[assignment[i]]]);
}

export interface SwissPairingInput {
  snapshot: TournamentSnapshot;
  roundNumber: number; // round being paired (>= 2)
  /** Normalized keys of pairs that already played (pairing_history). */
  history: PairingHistory;
}

/**
 * Monrad pairing for rounds 2+ (SPEC §5.3). Throws ManualPairingRequired with
 * the valid partial pairings when a group cannot be paired without rematches.
 */
export function pairSwissRound(input: SwissPairingInput): PairingPlan {
  const { snapshot, roundNumber, history } = input;
  const activePlayers = activePlayersForRound(snapshot.players, roundNumber);
  const ranking = computeStandings(snapshot, activePlayers);

  // 2. Bye: worst-ranked who never received one; if all did, the absolute worst.
  let byePlayerId: number | null = null;
  const pool: StandingEntry[] = [...ranking];
  if (pool.length % 2 === 1) {
    let byeIndex = -1;
    for (let i = pool.length - 1; i >= 0; i--) {
      if (pool[i].byesReceived === 0) {
        byeIndex = i;
        break;
      }
    }
    if (byeIndex === -1) byeIndex = pool.length - 1;
    byePlayerId = pool[byeIndex].playerId;
    pool.splice(byeIndex, 1);
  }

  // 3. Group by match points (ranking order preserved inside each group).
  const groups: number[][] = [];
  let currentPoints: number | null = null;
  for (const entry of pool) {
    if (entry.matchPoints !== currentPoints) {
      groups.push([]);
      currentPoints = entry.matchPoints;
    }
    groups[groups.length - 1].push(entry.playerId);
  }

  // 4. Float-down: an odd group (not the last) sends its worst player to lead the next group.
  for (let g = 0; g < groups.length; g++) {
    if (groups[g].length % 2 === 1) {
      if (g === groups.length - 1) {
        // No group can absorb the floated player → manual pairing.
        throw new ManualPairingRequired([], groups.flat(), byePlayerId);
      }
      const floated = groups[g].pop();
      if (floated !== undefined) groups[g + 1].unshift(floated);
    }
  }

  // 5–7. Pair each group; tables numbered consecutively in group order.
  const pairings: Pairing[] = [];
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    if (group.length === 0) continue;
    const pairs = pairGroup(group, history);
    if (pairs === null) {
      const unpaired = groups.slice(g).flat();
      throw new ManualPairingRequired([...pairings], unpaired, byePlayerId);
    }
    for (const [playerAId, playerBId] of pairs) {
      pairings.push({ tableNumber: pairings.length + 1, playerAId, playerBId });
    }
  }

  return { pairings, byePlayerId };
}
