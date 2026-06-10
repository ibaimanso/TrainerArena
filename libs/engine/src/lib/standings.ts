/**
 * Scoring (SPEC §5.4) and tiebreakers (SPEC §5.5).
 * Win 3 · Draw 1 · Loss 0. Bye = win, counts as played and in byesReceived but
 * adds no real opponent. All forfeits count as played for both players and as
 * mutual real opponents; forfeit_both is a loss for both.
 */
import type { MatchSnapshot, PlayerSnapshot, TournamentSnapshot } from './types';
import { sha256Hex } from './sha256';

export interface PlayerStats {
  playerId: number;
  matchPoints: number;
  wins: number;
  draws: number;
  losses: number;
  gamesPlayed: number;
  byesReceived: number;
  /** Real opponents (byes excluded); repeats allowed if a rematch ever happened. */
  realOpponentIds: number[];
  /** (wins + 0.5·draws) / gamesPlayed; 0.0 if no games. */
  mwp: number;
  /** Max finishedAt among the player's matches (epoch ms); null = none. */
  lastFinishedAt: number | null;
}

export interface StandingEntry extends PlayerStats {
  owp: number;
  oowp: number;
}

type Result = 'win' | 'loss' | 'draw';

function resultFor(match: MatchSnapshot, playerId: number): Result | null {
  const isA = match.playerAId === playerId;
  const isB = match.playerBId === playerId;
  if (!isA && !isB) return null;
  switch (match.outcome) {
    case 'a_wins':
      return isA ? 'win' : 'loss';
    case 'b_wins':
      return isB ? 'win' : 'loss';
    case 'draw':
      return 'draw';
    case 'bye':
      return 'win';
    case 'forfeit_a':
      return isA ? 'loss' : 'win';
    case 'forfeit_b':
      return isB ? 'loss' : 'win';
    case 'forfeit_both':
      return 'loss';
  }
}

const POINTS: Record<Result, number> = { win: 3, draw: 1, loss: 0 };

/** Per-player stats from the snapshot's terminal matches. */
export function computeStats(snapshot: TournamentSnapshot): Map<number, PlayerStats> {
  const stats = new Map<number, PlayerStats>();
  const ensure = (playerId: number): PlayerStats => {
    let s = stats.get(playerId);
    if (!s) {
      s = {
        playerId,
        matchPoints: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gamesPlayed: 0,
        byesReceived: 0,
        realOpponentIds: [],
        mwp: 0,
        lastFinishedAt: null,
      };
      stats.set(playerId, s);
    }
    return s;
  };

  for (const player of snapshot.players) ensure(player.id);

  for (const match of snapshot.matches) {
    const participants = [match.playerAId, match.playerBId].filter(
      (id): id is number => id !== null
    );
    for (const playerId of participants) {
      const result = resultFor(match, playerId);
      if (result === null) continue;
      const s = ensure(playerId);
      s.matchPoints += POINTS[result];
      if (result === 'win') s.wins++;
      else if (result === 'draw') s.draws++;
      else s.losses++;
      s.gamesPlayed++;
      if (match.outcome === 'bye') {
        s.byesReceived++;
      } else {
        const opponentId = match.playerAId === playerId ? match.playerBId : match.playerAId;
        if (opponentId !== null) s.realOpponentIds.push(opponentId);
      }
      if (match.finishedAt !== null) {
        const ts = Date.parse(match.finishedAt);
        if (!Number.isNaN(ts)) {
          s.lastFinishedAt = s.lastFinishedAt === null ? ts : Math.max(s.lastFinishedAt, ts);
        }
      }
    }
  }

  for (const s of stats.values()) {
    s.mwp = s.gamesPlayed > 0 ? (s.wins + 0.5 * s.draws) / s.gamesPlayed : 0;
  }
  return stats;
}

/** OWP: mean MWP of real opponents (byes are not opponents). 0.0 with no opponents. */
export function computeOwp(stats: Map<number, PlayerStats>, playerId: number): number {
  const s = stats.get(playerId);
  if (!s || s.realOpponentIds.length === 0) return 0;
  let sum = 0;
  for (const oppId of s.realOpponentIds) {
    sum += stats.get(oppId)?.mwp ?? 0;
  }
  return sum / s.realOpponentIds.length;
}

/** OOWP: (Σ OWP of real opponents + 1.0 per bye received) / (nReal + nByes). */
export function computeOowp(stats: Map<number, PlayerStats>, playerId: number): number {
  const s = stats.get(playerId);
  if (!s) return 0;
  const denominator = s.realOpponentIds.length + s.byesReceived;
  if (denominator === 0) return 0;
  let sum = s.byesReceived * 1.0;
  for (const oppId of s.realOpponentIds) {
    sum += computeOwp(stats, oppId);
  }
  return sum / denominator;
}

/** Full standings for the given players, sorted by the strict §5.5 order. */
export function computeStandings(
  snapshot: TournamentSnapshot,
  players?: readonly PlayerSnapshot[]
): StandingEntry[] {
  const stats = computeStats(snapshot);
  const pool = players ?? snapshot.players;
  const entries: StandingEntry[] = pool.map((p) => {
    const s = stats.get(p.id) ?? {
      playerId: p.id,
      matchPoints: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gamesPlayed: 0,
      byesReceived: 0,
      realOpponentIds: [],
      mwp: 0,
      lastFinishedAt: null,
    };
    return { ...s, owp: computeOwp(stats, p.id), oowp: computeOowp(stats, p.id) };
  });
  entries.sort(standingsComparator(snapshot.pairingSeed));
  return entries;
}

/**
 * Strict total order (SPEC §5.5): match points → OWP → OOWP → earliest
 * last-match finishedAt (none = worst) → lexicographic sha256("{seed}:{id}").
 */
export function standingsComparator(
  pairingSeed: string
): (a: StandingEntry, b: StandingEntry) => number {
  return (a, b) => {
    if (a.matchPoints !== b.matchPoints) return b.matchPoints - a.matchPoints;
    if (a.owp !== b.owp) return b.owp - a.owp;
    if (a.oowp !== b.oowp) return b.oowp - a.oowp;
    const aTs = a.lastFinishedAt ?? Number.POSITIVE_INFINITY;
    const bTs = b.lastFinishedAt ?? Number.POSITIVE_INFINITY;
    if (aTs !== bTs) return aTs - bTs;
    const aHash = sha256Hex(`${pairingSeed}:${a.playerId}`);
    const bHash = sha256Hex(`${pairingSeed}:${b.playerId}`);
    return aHash < bHash ? -1 : aHash > bHash ? 1 : 0;
  };
}
