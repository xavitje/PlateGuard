import { DEFAULT_TAXONOMY } from '@plateguard/domain';
import { describe, expect, it } from 'vitest';
import { ALLERGEN_NAMES } from '../prisma/seed-data/allergens.js';

describe('allergen seed data', () => {
  it('matches the engine taxonomy exactly', () => {
    const seeded = Object.fromEntries(ALLERGEN_NAMES.map((a) => [a.code, a.parent ?? null]));
    expect(seeded).toEqual({ ...DEFAULT_TAXONOMY });
  });

  it('has an English and a Dutch name for every allergen', () => {
    for (const a of ALLERGEN_NAMES) {
      expect(a.names.en, a.code).toBeTruthy();
      expect(a.names.nl, a.code).toBeTruthy();
    }
  });
});
