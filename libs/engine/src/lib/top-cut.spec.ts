import {
  advanceTopCut,
  largestPowerOfTwoAtMost,
  matchWinner,
  seedTopCut,
  smallestPowerOfTwoAtLeast,
  type ClosedCutMatch,
} from './top-cut';

describe('power-of-two helpers', () => {
  it('largestPowerOfTwoAtMost', () => {
    expect(largestPowerOfTwoAtMost(0)).toBe(0);
    expect(largestPowerOfTwoAtMost(1)).toBe(0);
    expect(largestPowerOfTwoAtMost(2)).toBe(2);
    expect(largestPowerOfTwoAtMost(3)).toBe(2);
    expect(largestPowerOfTwoAtMost(7)).toBe(4);
    expect(largestPowerOfTwoAtMost(8)).toBe(8);
    expect(largestPowerOfTwoAtMost(63)).toBe(32);
  });
  it('smallestPowerOfTwoAtLeast', () => {
    expect(smallestPowerOfTwoAtLeast(1)).toBe(1);
    expect(smallestPowerOfTwoAtLeast(2)).toBe(2);
    expect(smallestPowerOfTwoAtLeast(3)).toBe(4);
    expect(smallestPowerOfTwoAtLeast(5)).toBe(8);
  });
});

describe('seedTopCut (SPEC §7)', () => {
  it('T8: 1v8, 2v7, 3v6, 4v5 at positions 1..4', () => {
    const pairings = seedTopCut([1, 2, 3, 4, 5, 6, 7, 8], 8);
    expect(pairings).toEqual([
      { bracketPosition: 1, playerAId: 1, playerBId: 8, isBye: false },
      { bracketPosition: 2, playerAId: 2, playerBId: 7, isBye: false },
      { bracketPosition: 3, playerAId: 3, playerBId: 6, isBye: false },
      { bracketPosition: 4, playerAId: 4, playerBId: 5, isBye: false },
    ]);
  });

  it('T4: 1v4, 2v3', () => {
    expect(seedTopCut([10, 20, 30, 40], 4)).toEqual([
      { bracketPosition: 1, playerAId: 10, playerBId: 40, isBye: false },
      { bracketPosition: 2, playerAId: 20, playerBId: 30, isBye: false },
    ]);
  });

  it('clamps to the largest power of 2 ≤ min(configured, actives)', () => {
    // 7 actives, configured 8 → effective 4 → top 4 by ranking
    expect(seedTopCut([1, 2, 3, 4, 5, 6, 7], 8)).toEqual([
      { bracketPosition: 1, playerAId: 1, playerBId: 4, isBye: false },
      { bracketPosition: 2, playerAId: 2, playerBId: 3, isBye: false },
    ]);
    // configured smaller than actives
    expect(seedTopCut([1, 2, 3, 4, 5, 6, 7, 8], 4)).toHaveLength(2);
  });

  it('returns null when fewer than 2 seats (tournament finishes directly)', () => {
    expect(seedTopCut([1], 8)).toBeNull();
    expect(seedTopCut([], 4)).toBeNull();
    expect(seedTopCut([1, 2, 3], 0)).toBeNull();
  });
});

describe('matchWinner', () => {
  const base = { bracketPosition: 1, playerAId: 1, playerBId: 2 };
  it('resolves each terminal outcome', () => {
    expect(matchWinner({ ...base, outcome: 'a_wins' })).toBe(1);
    expect(matchWinner({ ...base, outcome: 'b_wins' })).toBe(2);
    expect(matchWinner({ ...base, outcome: 'forfeit_a' })).toBe(2);
    expect(matchWinner({ ...base, outcome: 'forfeit_b' })).toBe(1);
    expect(matchWinner({ ...base, outcome: 'forfeit_both' })).toBeNull();
    expect(matchWinner({ ...base, playerBId: null, outcome: 'bye' })).toBe(1);
  });
});

describe('advanceTopCut (fold, SPEC §7)', () => {
  it('T8 → semifinals: winner(1) vs winner(4), winner(2) vs winner(3)', () => {
    const closed: ClosedCutMatch[] = [
      { bracketPosition: 1, playerAId: 1, playerBId: 8, outcome: 'a_wins' },
      { bracketPosition: 2, playerAId: 2, playerBId: 7, outcome: 'b_wins' }, // upset: 7
      { bracketPosition: 3, playerAId: 3, playerBId: 6, outcome: 'a_wins' },
      { bracketPosition: 4, playerAId: 4, playerBId: 5, outcome: 'b_wins' }, // upset: 5
    ];
    const advance = advanceTopCut(closed);
    expect(advance.finished).toBe(false);
    expect(advance.pairings).toEqual([
      { bracketPosition: 1, playerAId: 1, playerBId: 5, isBye: false },
      { bracketPosition: 2, playerAId: 7, playerBId: 3, isBye: false },
    ]);
  });

  it('without upsets a T8 semifinal is 1v4 and 2v3', () => {
    const closed: ClosedCutMatch[] = [
      { bracketPosition: 1, playerAId: 1, playerBId: 8, outcome: 'a_wins' },
      { bracketPosition: 2, playerAId: 2, playerBId: 7, outcome: 'a_wins' },
      { bracketPosition: 3, playerAId: 3, playerBId: 6, outcome: 'a_wins' },
      { bracketPosition: 4, playerAId: 4, playerBId: 5, outcome: 'a_wins' },
    ];
    const advance = advanceTopCut(closed);
    expect(advance.pairings).toEqual([
      { bracketPosition: 1, playerAId: 1, playerBId: 4, isBye: false },
      { bracketPosition: 2, playerAId: 2, playerBId: 3, isBye: false },
    ]);
  });

  it('forfeit_both in one position gives its rival a bye', () => {
    const closed: ClosedCutMatch[] = [
      { bracketPosition: 1, playerAId: 1, playerBId: 4, outcome: 'a_wins' },
      { bracketPosition: 2, playerAId: 2, playerBId: 3, outcome: 'forfeit_both' },
    ];
    const advance = advanceTopCut(closed);
    expect(advance.finished).toBe(false);
    expect(advance.pairings).toEqual([
      { bracketPosition: 1, playerAId: 1, playerBId: null, isBye: true },
    ]);
  });

  it('two empty positions propagate the gap (no match created)', () => {
    const closed: ClosedCutMatch[] = [
      { bracketPosition: 1, playerAId: 1, playerBId: 8, outcome: 'forfeit_both' },
      { bracketPosition: 2, playerAId: 2, playerBId: 7, outcome: 'a_wins' },
      { bracketPosition: 3, playerAId: 3, playerBId: 6, outcome: 'a_wins' },
      { bracketPosition: 4, playerAId: 4, playerBId: 5, outcome: 'forfeit_both' },
    ];
    const advance = advanceTopCut(closed);
    // j=1: positions 1 & 4 both empty → gap. j=2: 2v3.
    expect(advance.pairings).toEqual([
      { bracketPosition: 2, playerAId: 2, playerBId: 3, isBye: false },
    ]);
    expect(advance.finished).toBe(false);
  });

  it('no winners at all → tournament finished without champion', () => {
    const closed: ClosedCutMatch[] = [
      { bracketPosition: 1, playerAId: 1, playerBId: 4, outcome: 'forfeit_both' },
      { bracketPosition: 2, playerAId: 2, playerBId: 3, outcome: 'forfeit_both' },
    ];
    const advance = advanceTopCut(closed);
    expect(advance.finished).toBe(true);
    expect(advance.championId).toBeNull();
    expect(advance.pairings).toEqual([]);
  });

  it('the final closing yields the champion', () => {
    const advance = advanceTopCut([
      { bracketPosition: 1, playerAId: 9, playerBId: 5, outcome: 'b_wins' },
    ]);
    expect(advance.finished).toBe(true);
    expect(advance.championId).toBe(5);
  });

  it('double forfeit in the final → finished with null champion', () => {
    const advance = advanceTopCut([
      { bracketPosition: 1, playerAId: 9, playerBId: 5, outcome: 'forfeit_both' },
    ]);
    expect(advance.finished).toBe(true);
    expect(advance.championId).toBeNull();
  });

  it('K tolerates gaps: computed from max(match count, max position)', () => {
    // Only positions 2 and 3 exist (gap at 1 and 4 from previous round).
    const closed: ClosedCutMatch[] = [
      { bracketPosition: 2, playerAId: 7, playerBId: null, outcome: 'bye' },
      { bracketPosition: 3, playerAId: 3, playerBId: 6, outcome: 'a_wins' },
    ];
    const advance = advanceTopCut(closed);
    // K = 4 → j=1: pos1(∅) vs pos4(∅) → gap; j=2: pos2(7) vs pos3(3) → 7v3.
    expect(advance.pairings).toEqual([
      { bracketPosition: 2, playerAId: 7, playerBId: 3, isBye: false },
    ]);
  });
});
