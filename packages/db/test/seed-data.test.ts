import { DEFAULT_TAXONOMY } from '@plateguard/domain';
import { describe, expect, it } from 'vitest';
import { ALLERGEN_NAMES } from '../prisma/seed-data/allergens.js';
import { COMPONENTS, DISHES, INGREDIENTS } from '../prisma/seed-data/menu.js';

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

describe('demo menu seed data', () => {
  const codes = new Set(ALLERGEN_NAMES.map((a) => a.code));

  it('only uses known allergen codes', () => {
    for (const i of Object.values(INGREDIENTS)) {
      for (const code of [...(i.contains ?? []), ...(i.mayContain ?? [])])
        expect(codes.has(code), `${i.name}: ${code}`).toBe(true);
    }
  });

  it('builds every component and dish from parts that exist', () => {
    for (const c of Object.values(COMPONENTS)) {
      for (const k of c.ingredients) expect(INGREDIENTS[k], `${c.name}: ${k}`).toBeDefined();
      for (const k of c.substitutions ?? []) expect(COMPONENTS[k], `${c.name}: ${k}`).toBeDefined();
    }
    for (const d of DISHES) {
      expect(d.components.length, d.name).toBeGreaterThan(0);
      for (const k of d.components) expect(COMPONENTS[k], `${d.name}: ${k}`).toBeDefined();
    }
  });

  it('has unique names, since the seed matches on them', () => {
    const unique = (names: string[]) => expect(new Set(names).size).toBe(names.length);
    unique(Object.values(INGREDIENTS).map((i) => i.name));
    unique(Object.values(COMPONENTS).map((c) => c.name));
    unique(DISHES.map((d) => d.name));
  });
});
