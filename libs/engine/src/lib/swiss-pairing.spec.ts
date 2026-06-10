import type { MatchOutcome } from './types';
import { pairKey, pairRound1, pairSwissRound, type PairingHistory } from './swiss-pairing';
import { ManualPairingRequired, type MatchSnapshot, type TournamentSnapshot } from './types';

const players = (ids: number[], dropped: Array<[number, number | null]> = []) =>
  ids.map((id) => {
    const drop = dropped.find(([d]) => d === id);
    return {
      id,
      dropped: drop !== undefined,
      droppedAfterRoundNumber: drop ? drop[1] : null,
    };
  });

const match = (
  roundNumber: number,
  tableNumber: number,
  playerAId: number,
  playerBId: number | null,
  outcome: MatchOutcome,
  finishedAt: string | null = `2026-01-01T10:${String(tableNumber).padStart(2, '0')}:00Z`
): MatchSnapshot => ({ roundNumber, tableNumber, playerAId, playerBId, outcome, finishedAt });

const historyOf = (matches: MatchSnapshot[]): PairingHistory =>
  new Set(
    matches
      .filter((m) => m.playerBId !== null && m.outcome !== 'bye')
      .map((m) => pairKey(m.playerAId, m.playerBId as number))
  );

describe('pairRound1 (SPEC §5.2)', () => {
  const snapshot = (ids: number[], seed = 'seed-r1'): TournamentSnapshot => ({
    pairingSeed: seed,
    currentRoundNumber: 0,
    players: players(ids),
    matches: [],
  });

  it('pairs everyone in shuffle order with consecutive tables', () => {
    const plan = pairRound1(snapshot([1, 2, 3, 4, 5, 6]));
    expect(plan.byePlayerId).toBeNull();
    expect(plan.pairings).toHaveLength(3);
    expect(plan.pairings.map((p) => p.tableNumber)).toEqual([1, 2, 3]);
    const all = plan.pairings.flatMap((p) => [p.playerAId, p.playerBId]).sort((a, b) => a - b);
    expect(all).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('is reproducible by seed', () => {
    expect(pairRound1(snapshot([1, 2, 3, 4, 5, 6, 7, 8]))).toEqual(
      pairRound1(snapshot([1, 2, 3, 4, 5, 6, 7, 8]))
    );
  });

  it('a different seed gives a different pairing', () => {
    const a = pairRound1(snapshot([1, 2, 3, 4, 5, 6, 7, 8], 'seed-a'));
    const b = pairRound1(snapshot([1, 2, 3, 4, 5, 6, 7, 8], 'seed-b'));
    expect(a).not.toEqual(b);
  });

  it('odd count: the last after the shuffle receives the bye', () => {
    const plan = pairRound1(snapshot([1, 2, 3, 4, 5]));
    expect(plan.byePlayerId).not.toBeNull();
    expect(plan.pairings).toHaveLength(2);
    const paired = plan.pairings.flatMap((p) => [p.playerAId, p.playerBId]);
    expect(paired).not.toContain(plan.byePlayerId);
    expect([...paired, plan.byePlayerId].sort((a, b) => (a as number) - (b as number))).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it('excludes dropped players', () => {
    const snap = snapshot([1, 2, 3, 4]);
    snap.players = players([1, 2, 3, 4], [[4, null]]);
    const plan = pairRound1(snap);
    const ids = plan.pairings.flatMap((p) => [p.playerAId, p.playerBId]);
    expect(ids).not.toContain(4);
    expect(plan.byePlayerId).not.toBeNull(); // 3 actives → bye
  });
});

describe('pairSwissRound (SPEC §5.3 Monrad)', () => {
  it('pairs winners vs winners and losers vs losers (groups by points)', () => {
    const matches = [
      match(1, 1, 1, 2, 'a_wins', '2026-01-01T10:01:00Z'),
      match(1, 2, 3, 4, 'a_wins', '2026-01-01T10:02:00Z'),
    ];
    const snapshot: TournamentSnapshot = {
      pairingSeed: 'monrad',
      currentRoundNumber: 1,
      players: players([1, 2, 3, 4]),
      matches,
    };
    const plan = pairSwissRound({ snapshot, roundNumber: 2, history: historyOf(matches) });
    expect(plan.byePlayerId).toBeNull();
    expect(plan.pairings).toEqual([
      { tableNumber: 1, playerAId: 1, playerBId: 3 },
      { tableNumber: 2, playerAId: 2, playerBId: 4 },
    ]);
  });

  it('float-down: odd group sends its worst player to lead the next group', () => {
    // 6 players, R1: 1>2, 3>4, 5>6 → winners group [1,3,5] odd.
    const matches = [
      match(1, 1, 1, 2, 'a_wins', '2026-01-01T10:01:00Z'),
      match(1, 2, 3, 4, 'a_wins', '2026-01-01T10:02:00Z'),
      match(1, 3, 5, 6, 'a_wins', '2026-01-01T10:03:00Z'),
    ];
    const snapshot: TournamentSnapshot = {
      pairingSeed: 'float',
      currentRoundNumber: 1,
      players: players([1, 2, 3, 4, 5, 6]),
      matches,
    };
    const plan = pairSwissRound({ snapshot, roundNumber: 2, history: historyOf(matches) });
    // Ranking among 3-pointers (same OWP/OOWP=0 owp... all opponents 0-1 → owp equal)
    // ties break by earlier finishedAt: 1, 3, 5. Worst (5) floats to losers group.
    // Winners group [1,3] → 1v3. Losers group [5,2,4,6] → UH [5,2] LH [4,6] → 5v4, 2v6.
    expect(plan.pairings).toEqual([
      { tableNumber: 1, playerAId: 1, playerBId: 3 },
      { tableNumber: 2, playerAId: 5, playerBId: 4 },
      { tableNumber: 3, playerAId: 2, playerBId: 6 },
    ]);
  });

  it('avoids rematches via deterministic backtracking on LH permutations', () => {
    // Single group of 4 with identical records; history forces UH[0]≠LH[0].
    const matches = [
      match(1, 1, 1, 3, 'draw', '2026-01-01T10:01:00Z'),
      match(1, 2, 2, 4, 'draw', '2026-01-01T10:01:00Z'),
    ];
    const snapshot: TournamentSnapshot = {
      pairingSeed: 'backtrack',
      currentRoundNumber: 1,
      players: players([1, 2, 3, 4]),
      matches,
    };
    const plan = pairSwissRound({ snapshot, roundNumber: 2, history: historyOf(matches) });
    expect(plan.pairings).toHaveLength(2);
    for (const pairing of plan.pairings) {
      expect(historyOf(matches).has(pairKey(pairing.playerAId, pairing.playerBId))).toBe(false);
    }
  });

  it('throws ManualPairingRequired preserving valid partial pairings', () => {
    // R1: 1>2, 3>4. R2: 1>3, 4>2 → R3 groups: [1(6)], [3,4(3)], [2(0)]
    // After floats: [1 floats to {3,4} → [1,3,4] odd → 4 floats to [2] → [4,2]]
    // Group [1,3]: 1 already played 3 → unpairable (single permutation) → manual.
    const matches = [
      match(1, 1, 1, 2, 'a_wins', '2026-01-01T10:01:00Z'),
      match(1, 2, 3, 4, 'a_wins', '2026-01-01T10:02:00Z'),
      match(2, 1, 1, 3, 'a_wins', '2026-01-01T11:01:00Z'),
      match(2, 2, 4, 2, 'a_wins', '2026-01-01T11:02:00Z'),
    ];
    const snapshot: TournamentSnapshot = {
      pairingSeed: 'manual',
      currentRoundNumber: 2,
      players: players([1, 2, 3, 4]),
      matches,
    };
    let caught: ManualPairingRequired | null = null;
    try {
      pairSwissRound({ snapshot, roundNumber: 3, history: historyOf(matches) });
    } catch (e) {
      caught = e as ManualPairingRequired;
    }
    expect(caught).toBeInstanceOf(ManualPairingRequired);
    // The failing group is the first one → no partials before it; 4v2 group never reached.
    expect(caught?.partialPairings).toEqual([]);
    expect(caught?.unpairedPlayerIds.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('partial pairings from earlier groups are preserved when a later group fails', () => {
    // 6 players. R1: 1>2, 3>4, 5 vs 6 draw... build: winners 1,3 (3pts), 5,6 (1pt), losers 2,4 (0).
    // History: 5 already played 6 → group [5,6] unpairable; group [1,3] pairs fine (1v3 not played).
    const matches = [
      match(1, 1, 1, 2, 'a_wins', '2026-01-01T10:01:00Z'),
      match(1, 2, 3, 4, 'a_wins', '2026-01-01T10:02:00Z'),
      match(1, 3, 5, 6, 'draw', '2026-01-01T10:03:00Z'),
    ];
    const snapshot: TournamentSnapshot = {
      pairingSeed: 'partials',
      currentRoundNumber: 1,
      players: players([1, 2, 3, 4, 5, 6]),
      matches,
    };
    let caught: ManualPairingRequired | null = null;
    try {
      pairSwissRound({ snapshot, roundNumber: 2, history: historyOf(matches) });
    } catch (e) {
      caught = e as ManualPairingRequired;
    }
    expect(caught).toBeInstanceOf(ManualPairingRequired);
    expect(caught?.partialPairings).toEqual([{ tableNumber: 1, playerAId: 1, playerBId: 3 }]);
    expect(caught?.unpairedPlayerIds.sort((a, b) => a - b)).toEqual([2, 4, 5, 6]);
  });

  describe('bye selection (SPEC §5.3.2)', () => {
    it('worst ranked who never received a bye', () => {
      // 5 players. R1: 5 had the bye; 1>2, 3>4.
      const matches = [
        match(1, 1, 1, 2, 'a_wins', '2026-01-01T10:01:00Z'),
        match(1, 2, 3, 4, 'a_wins', '2026-01-01T10:02:00Z'),
        match(1, 3, 5, null, 'bye', '2026-01-01T10:00:00Z'),
      ];
      const snapshot: TournamentSnapshot = {
        pairingSeed: 'bye-pick',
        currentRoundNumber: 1,
        players: players([1, 2, 3, 4, 5]),
        matches,
      };
      const plan = pairSwissRound({ snapshot, roundNumber: 2, history: historyOf(matches) });
      // Worst two are 2 and 4 (0 pts). Ranking ties → 2 finished earlier → 4 is worst.
      // 4 never had a bye → 4 gets it.
      expect(plan.byePlayerId).toBe(4);
      const ids = plan.pairings.flatMap((p) => [p.playerAId, p.playerBId]);
      expect(ids).not.toContain(4);
    });

    it('never repeats the bye while someone has not had one (skips over previous bye receivers)', () => {
      // 3 players: 3 already got a bye in R1 and lost R2 (worst). 1 beat 2 and 3.
      const matches = [
        match(1, 1, 1, 2, 'a_wins', '2026-01-01T10:01:00Z'),
        match(1, 2, 3, null, 'bye', '2026-01-01T10:00:00Z'),
        match(2, 1, 1, 3, 'a_wins', '2026-01-01T11:01:00Z'),
        match(2, 2, 2, null, 'bye', '2026-01-01T11:00:00Z'),
      ];
      const snapshot: TournamentSnapshot = {
        pairingSeed: 'bye-skip',
        currentRoundNumber: 2,
        players: players([1, 2, 3]),
        matches,
      };
      const plan = pairSwissRound({ snapshot, roundNumber: 3, history: historyOf(matches) });
      // Only 1 has no bye yet, so 1 receives it even being the leader.
      expect(plan.byePlayerId).toBe(1);
    });

    it('if everyone already had a bye, the absolute worst gets it', () => {
      const matches = [
        match(1, 1, 1, null, 'bye', '2026-01-01T10:00:00Z'),
        match(2, 1, 2, null, 'bye', '2026-01-01T11:00:00Z'),
        match(3, 1, 3, null, 'bye', '2026-01-01T12:00:00Z'),
        // separate them on points: 1 beats 2; 1 beats 3; 2 beats 3
        match(4, 1, 1, 2, 'a_wins', '2026-01-01T13:00:00Z'),
        match(5, 1, 1, 3, 'a_wins', '2026-01-01T14:00:00Z'),
        match(6, 1, 2, 3, 'a_wins', '2026-01-01T15:00:00Z'),
      ];
      const snapshot: TournamentSnapshot = {
        pairingSeed: 'bye-all',
        currentRoundNumber: 6,
        players: players([1, 2, 3]),
        matches,
      };
      const plan = pairSwissRound({ snapshot, roundNumber: 7, history: new Set() });
      // 3 lost everything → absolute worst → bye (even though it already had one).
      expect(plan.byePlayerId).toBe(3);
    });
  });

  it('excludes players dropped before this round but keeps those dropped after it', () => {
    const matches = [
      match(1, 1, 1, 2, 'a_wins', '2026-01-01T10:01:00Z'),
      match(1, 2, 3, 4, 'a_wins', '2026-01-01T10:02:00Z'),
    ];
    const snapshot: TournamentSnapshot = {
      pairingSeed: 'drops',
      currentRoundNumber: 1,
      players: players(
        [1, 2, 3, 4],
        [
          [2, 1], // dropped after R1 → out for R2
          [4, 2], // dropped after R2 → still plays R2
        ]
      ),
      matches,
    };
    const plan = pairSwissRound({ snapshot, roundNumber: 2, history: historyOf(matches) });
    const ids = [
      ...plan.pairings.flatMap((p) => [p.playerAId, p.playerBId]),
      ...(plan.byePlayerId !== null ? [plan.byePlayerId] : []),
    ];
    expect(ids).not.toContain(2);
    expect(ids).toContain(4);
    expect(ids.sort((a, b) => a - b)).toEqual([1, 3, 4]);
  });
});
