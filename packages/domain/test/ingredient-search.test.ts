import { describe, expect, it } from 'vitest';
import { searchIngredients, type SearchableIngredient } from '../src/index.js';

const list: SearchableIngredient[] = [
  { id: 'tom', name: 'Tomato', synonyms: ['tomaat', 'tomaten'] },
  { id: 'cherry', name: 'Cherry tomato', synonyms: ['cherrytomaat'] },
  { id: 'paste', name: 'Tomato paste', synonyms: ['tomatenpuree'] },
  { id: 'sun', name: 'Sunflower oil', synonyms: ['zonnebloemolie'] },
  { id: 'olive', name: 'Olive oil', synonyms: ['olijfolie'] },
  { id: 'creme', name: 'Crème fraîche', synonyms: [] },
];

describe('searchIngredients', () => {
  it('finds by name and by synonym, best match first', () => {
    expect(searchIngredients('tomato', list).map((m) => m.id)).toEqual(['tom', 'paste', 'cherry']);
    expect(searchIngredients('tomaat', list)[0]).toMatchObject({ id: 'tom', matched: 'tomaat' });
  });

  it('matches any word start, then substrings', () => {
    expect(searchIngredients('oil', list).map((m) => m.id)).toEqual(['olive', 'sun']);
    expect(
      searchIngredients('olie', list)
        .map((m) => m.id)
        .sort(),
    ).toEqual(['olive', 'sun']);
  });

  it('ignores case and accents', () => {
    expect(searchIngredients('CREME FR', list)[0]?.id).toBe('creme');
  });

  it('needs at least two characters and respects the limit', () => {
    expect(searchIngredients('t', list)).toEqual([]);
    expect(searchIngredients('to', list, 1)).toHaveLength(1);
  });
});
