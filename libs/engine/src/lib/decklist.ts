/**
 * Pokémon TCG Live decklist parser and validator (SPEC §9).
 */

export interface ParsedCard {
  quantity: number;
  name: string;
  set: string;
  number: string;
}

export interface ParsedDecklist {
  pokemon: ParsedCard[];
  trainer: ParsedCard[];
  energy: ParsedCard[];
  total: number;
}

type Section = 'pokemon' | 'trainer' | 'energy';

const SECTION_HEADERS: Array<{ pattern: RegExp; section: Section }> = [
  { pattern: /^pok[eé]mon\s*:/i, section: 'pokemon' },
  { pattern: /^trainer\s*:/i, section: 'trainer' },
  { pattern: /^energy\s*:/i, section: 'energy' },
];

const CARD_LINE = /^(\d+)\s+(.+?)\s+([A-Z]{2,6})\s+(\S+)$/;

/**
 * Parses a TCG Live export: empty lines and comments (#, //) are ignored;
 * section headers (with or without accent, case-insensitive) switch the
 * current section; lines before the first header are ignored.
 */
export function parseDecklist(rawText: string): ParsedDecklist {
  const result: ParsedDecklist = { pokemon: [], trainer: [], energy: [], total: 0 };
  let currentSection: Section | null = null;

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#') || line.startsWith('//')) continue;

    const header = SECTION_HEADERS.find((h) => h.pattern.test(line));
    if (header) {
      currentSection = header.section;
      continue;
    }
    if (currentSection === null) continue;

    const match = CARD_LINE.exec(line);
    if (!match) continue;
    const quantity = Number(match[1]);
    if (quantity <= 0) continue;

    result[currentSection].push({
      quantity,
      name: match[2],
      set: match[3],
      number: match[4],
    });
    result.total += quantity;
  }

  return result;
}

/** Spanish validation messages (SPEC §9): exactly 60 cards and ≥1 Pokémon. */
export function validateDecklist(decklist: ParsedDecklist): string[] {
  const errors: string[] = [];
  if (decklist.total !== 60) {
    errors.push(`La lista debe tener exactamente 60 cartas (tiene ${decklist.total}).`);
  }
  if (decklist.pokemon.length === 0) {
    errors.push('La lista debe incluir al menos una carta de Pokémon.');
  }
  return errors;
}
