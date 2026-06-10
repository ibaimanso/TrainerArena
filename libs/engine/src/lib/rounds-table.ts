/** Official structure table (SPEC §5.1) — wizard autofill; values are exactly the spec's. */

export interface TournamentStructure {
  swissRounds: number;
  topCutSize: number;
}

export function officialStructure(playerCount: number): TournamentStructure {
  if (playerCount <= 8) return { swissRounds: 3, topCutSize: 0 };
  if (playerCount <= 16) return { swissRounds: 4, topCutSize: 4 };
  if (playerCount <= 32) return { swissRounds: 6, topCutSize: 8 };
  if (playerCount <= 64) return { swissRounds: 7, topCutSize: 8 };
  if (playerCount <= 128) return { swissRounds: 6, topCutSize: 16 };
  if (playerCount <= 256) return { swissRounds: 7, topCutSize: 16 };
  if (playerCount <= 512) return { swissRounds: 8, topCutSize: 16 };
  if (playerCount <= 1024) return { swissRounds: 9, topCutSize: 32 };
  if (playerCount <= 2048) return { swissRounds: 10, topCutSize: 32 };
  return { swissRounds: 10, topCutSize: 64 };
}
