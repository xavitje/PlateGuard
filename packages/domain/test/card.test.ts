import { describe, expect, it } from 'vitest';
import { allergenCard } from '../src/index.js';
import { dish, simple, substitute } from './fixtures.js';

describe('allergenCard', () => {
  it('marks each allergen as in the dish, on request, a trace, unknown or none found', () => {
    const steak = dish('Steak', [
      simple('Beef', {}),
      simple(
        'Jus',
        { contains: ['GLUTEN_WHEAT'] },
        {
          substitutions: [substitute(simple('GF jus', {}), true)],
        },
      ),
      simple('Fries', { mayContain: ['MILK'] }),
      simple('Butter', { contains: ['MILK'] }),
    ]);
    const special = dish('Special', [simple('Mystery sauce', { verified: false })]);
    const [row, unknown] = allergenCard([steak, special], ['GLUTEN', 'MILK', 'FISH']);
    expect(row).toEqual({
      dish: { id: steak.id, name: 'Steak' },
      marks: { GLUTEN: 'ON_REQUEST', MILK: 'CONTAINS', FISH: null },
    });
    // An unverified ingredient cannot be judged for anyone.
    expect(unknown!.marks.FISH).toBe('UNKNOWN');
  });

  it('a plain verified dish shows contains, traces and none found', () => {
    const soup = dish('Soup', [
      simple('Stock', { contains: ['CELERY'] }),
      simple('Croutons', { contains: ['GLUTEN_WHEAT'] }, { omittable: true }),
      simple('Cream', { mayContain: ['EGGS'] }),
    ]);
    const [row] = allergenCard([soup], ['CELERY', 'GLUTEN', 'EGGS', 'FISH']);
    expect(row!.marks).toEqual({
      CELERY: 'CONTAINS',
      GLUTEN: 'ON_REQUEST',
      EGGS: 'TRACES',
      FISH: null,
    });
  });
});
