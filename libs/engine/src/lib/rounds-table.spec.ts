import { officialStructure } from './rounds-table';

describe('officialStructure (SPEC §5.1)', () => {
  const cases: Array<[number, number, number]> = [
    [4, 3, 0],
    [8, 3, 0],
    [9, 4, 4],
    [16, 4, 4],
    [17, 6, 8],
    [32, 6, 8],
    [33, 7, 8],
    [64, 7, 8],
    [65, 6, 16],
    [128, 6, 16],
    [129, 7, 16],
    [256, 7, 16],
    [257, 8, 16],
    [512, 8, 16],
    [513, 9, 32],
    [1024, 9, 32],
    [1025, 10, 32],
    [2048, 10, 32],
    [2049, 10, 64],
    [5000, 10, 64],
  ];

  it.each(cases)('%i players → %i swiss rounds, top cut %i', (players, swiss, cut) => {
    expect(officialStructure(players)).toEqual({ swissRounds: swiss, topCutSize: cut });
  });
});
