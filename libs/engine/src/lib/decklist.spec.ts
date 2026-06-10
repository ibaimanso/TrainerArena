import { parseDecklist, validateDecklist } from './decklist';

const SPEC_EXAMPLE = `Pokémon: 12
4 Charizard ex OBF 125
3 Charmander MEW 4

Trainer: 36
4 Arven OBF 186

Energy: 12
12 Basic Fire Energy SVE 230
`;

describe('parseDecklist (SPEC §9)', () => {
  it('parses the spec example into sections with quantity/name/set/number', () => {
    const deck = parseDecklist(SPEC_EXAMPLE);
    expect(deck.pokemon).toEqual([
      { quantity: 4, name: 'Charizard ex', set: 'OBF', number: '125' },
      { quantity: 3, name: 'Charmander', set: 'MEW', number: '4' },
    ]);
    expect(deck.trainer).toEqual([{ quantity: 4, name: 'Arven', set: 'OBF', number: '186' }]);
    expect(deck.energy).toEqual([
      { quantity: 12, name: 'Basic Fire Energy', set: 'SVE', number: '230' },
    ]);
    expect(deck.total).toBe(4 + 3 + 4 + 12);
  });

  it('accepts headers without accent and case-insensitive', () => {
    const deck = parseDecklist('pokemon: 1\n1 Pikachu SVI 25\nTRAINER: 1\n1 Arven OBF 186');
    expect(deck.pokemon).toHaveLength(1);
    expect(deck.trainer).toHaveLength(1);
  });

  it('ignores empty lines and # / // comments', () => {
    const deck = parseDecklist(
      'Pokémon: 2\n# comentario\n// otro\n\n2 Pikachu SVI 25\n'
    );
    expect(deck.pokemon).toEqual([{ quantity: 2, name: 'Pikachu', set: 'SVI', number: '25' }]);
    expect(deck.total).toBe(2);
  });

  it('ignores lines before the first section header', () => {
    const deck = parseDecklist('4 Charizard ex OBF 125\nPokémon: 1\n1 Pikachu SVI 25');
    expect(deck.pokemon).toEqual([{ quantity: 1, name: 'Pikachu', set: 'SVI', number: '25' }]);
  });

  it('card regex: set is 2–6 uppercase letters; number is the last token', () => {
    const deck = parseDecklist(
      'Trainer: 3\n1 Professor Sada PAL 256a\n1 Boss OBFEN 99\n1 nombre sin set 25'
    );
    expect(deck.trainer).toEqual([
      { quantity: 1, name: 'Professor Sada', set: 'PAL', number: '256a' },
      { quantity: 1, name: 'Boss', set: 'OBFEN', number: '99' },
    ]);
  });

  it('ignores quantity ≤ 0 and non-matching lines', () => {
    const deck = parseDecklist('Pokémon: 2\n0 Pikachu SVI 25\nbasura\n1 Mew MEW 53');
    expect(deck.pokemon).toEqual([{ quantity: 1, name: 'Mew', set: 'MEW', number: '53' }]);
    expect(deck.total).toBe(1);
  });

  it('handles CRLF line endings', () => {
    const deck = parseDecklist('Pokémon: 1\r\n1 Pikachu SVI 25\r\n');
    expect(deck.pokemon).toHaveLength(1);
  });
});

describe('validateDecklist (SPEC §9)', () => {
  const deckOf = (pokemonQty: number, energyQty: number) =>
    parseDecklist(`Pokémon: ${pokemonQty}\n${pokemonQty} Pikachu SVI 25\nEnergy: ${energyQty}\n${energyQty} Basic Lightning Energy SVE 235`);

  it('accepts exactly 60 cards with at least 1 Pokémon', () => {
    expect(validateDecklist(deckOf(10, 50))).toEqual([]);
  });

  it('rejects totals different from 60 with a Spanish message', () => {
    const errors = validateDecklist(deckOf(10, 40));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe('La lista debe tener exactamente 60 cartas (tiene 50).');
  });

  it('rejects decks without Pokémon', () => {
    const deck = parseDecklist('Energy: 60\n60 Basic Fire Energy SVE 230');
    const errors = validateDecklist(deck);
    expect(errors).toContain('La lista debe incluir al menos una carta de Pokémon.');
  });

  it('reports both problems at once', () => {
    const deck = parseDecklist('Energy: 10\n10 Basic Fire Energy SVE 230');
    expect(validateDecklist(deck)).toHaveLength(2);
  });
});
