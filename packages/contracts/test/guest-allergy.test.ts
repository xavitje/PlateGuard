import { describe, expect, it } from 'vitest';
import { GuestAllergyZ } from '../src/index.js';

describe('GuestAllergyZ', () => {
  it('accepts a known allergen and defaults to SEVERE', () => {
    expect(GuestAllergyZ.parse({ allergen: 'GLUTEN' })).toEqual({
      allergen: 'GLUTEN',
      severity: 'SEVERE',
    });
  });

  it('accepts a custom label and trims it', () => {
    expect(GuestAllergyZ.parse({ custom: '  tomato ', severity: 'ALLERGY' })).toEqual({
      custom: 'tomato',
      severity: 'ALLERGY',
    });
  });

  it('accepts an ingredient from the list', () => {
    expect(GuestAllergyZ.parse({ ingredient: { id: 'i1', name: 'Tomato' } })).toEqual({
      ingredient: { id: 'i1', name: 'Tomato' },
      severity: 'SEVERE',
    });
  });

  it('rejects an empty label, and both at once', () => {
    expect(() =>
      GuestAllergyZ.parse({ ingredient: { id: 'i1', name: 'Tomato' }, custom: 'tomato' }),
    ).toThrow();
    expect(() => GuestAllergyZ.parse({ custom: '  ' })).toThrow();
    expect(() => GuestAllergyZ.parse({ allergen: 'MILK', custom: 'milk' })).toThrow();
  });
});
