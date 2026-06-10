import { sha256Hex } from './sha256';

describe('sha256Hex (known vectors)', () => {
  it('empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('abc', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('longer ascii', () => {
    expect(sha256Hex('The quick brown fox jumps over the lazy dog')).toBe(
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'
    );
  });

  it('multi-block input (> 64 bytes)', () => {
    expect(sha256Hex('a'.repeat(100))).toBe(
      '2816597888e4a0d3a36b82b83316ab32680eb8f00f8cd3b904d681246d285a0e'
    );
  });

  it('utf-8 (accents)', () => {
    // node -e "crypto.createHash('sha256').update('Pokémon','utf8').digest('hex')"
    expect(sha256Hex('Pokémon')).toBe(
      'd6e9b032ef19220519986e5bd048e28ffc26316daa28a4c0dfaadc27c6f90caf'
    );
  });
});
