import { seededRandom, seededShuffle } from './rng';

describe('seeded RNG', () => {
  it('same seed produces the same sequence', () => {
    const a = seededRandom('seed-1');
    const b = seededRandom('seed-1');
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('different seeds produce different sequences', () => {
    const a = seededRandom('seed-1');
    const b = seededRandom('seed-2');
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('values stay in [0, 1)', () => {
    const rng = seededRandom('range');
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('seededShuffle', () => {
  const items = Array.from({ length: 20 }, (_, i) => i + 1);

  it('is reproducible for the same seed', () => {
    expect(seededShuffle(items, 'abc:round:1')).toEqual(seededShuffle(items, 'abc:round:1'));
  });

  it('different seeds give different orders', () => {
    expect(seededShuffle(items, 'abc:round:1')).not.toEqual(seededShuffle(items, 'xyz:round:1'));
  });

  it('returns a permutation and does not mutate the input', () => {
    const original = [...items];
    const shuffled = seededShuffle(items, 'perm');
    expect(items).toEqual(original);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(original);
  });
});
