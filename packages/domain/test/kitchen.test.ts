import { describe, expect, it } from 'vitest';
import { assess, kitchenBlock, kitchenChecklist, uncheckedItems } from '../src/index.js';
import { component, dish, ingredient, simple, substitute } from './fixtures.js';

const steak = dish('Steak', [
  component('Jus', {
    id: 'jus',
    ingredients: [ingredient('Flour', { contains: ['GLUTEN_WHEAT'] })],
    substitutions: [substitute(simple('GF jus', {}, { suitableForSevere: true }), true)],
  }),
  simple('Fries', { mayContain: ['MILK'] }, { id: 'fries' }),
]);

describe('kitchen checklist', () => {
  it('lists every allergy, every change, every check by hand and every possible trace', () => {
    const input = {
      dish: steak,
      guest: [
        { allergen: 'GLUTEN', severity: 'SEVERE' as const },
        { allergen: 'MILK', severity: 'INTOLERANCE' as const },
        { custom: 'Sesame oil', severity: 'ALLERGY' as const },
      ],
    };
    const result = assess(input);
    const items = kitchenChecklist(result);
    expect(items.map((i) => i.kind)).toEqual([
      'ALLERGY',
      'ALLERGY',
      'ALLERGY',
      'SUBSTITUTE',
      'MANUAL',
      'TRACES',
    ]);
    expect(kitchenBlock(result)).toBeNull();
    expect(
      uncheckedItems(
        items,
        items.slice(1).map((i) => i.id),
      ),
    ).toHaveLength(1);
    expect(
      uncheckedItems(
        items,
        items.map((i) => i.id),
      ),
    ).toEqual([]);
    // The same plate gives the same ids, so the API can check what the cook ticked.
    expect(kitchenChecklist(assess(input)).map((i) => i.id)).toEqual(items.map((i) => i.id));
  });

  it('blocks a plate that must not go out, and one with unverified data', () => {
    const severeMilk = assess({ dish: steak, guest: [{ allergen: 'MILK', severity: 'SEVERE' }] });
    expect(kitchenBlock(severeMilk)).toBe('DO_NOT_SERVE');
    const unverified = dish('Soup', [simple('Soup', { verified: false })]);
    expect(
      kitchenBlock(
        assess({ dish: unverified, guest: [{ allergen: 'MILK', severity: 'ALLERGY' }] }),
      ),
    ).toBe('UNKNOWN_DATA');
  });
});
