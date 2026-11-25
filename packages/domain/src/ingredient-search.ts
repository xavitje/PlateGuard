import { normalizeLabel } from './engine.js';

/** An entry of the restaurant's ingredient list, with the other names people use for it. */
export interface SearchableIngredient {
  id: string;
  name: string;
  /** "tomaat", "tomatoes", "cherry tomato". Also the name in each language. */
  synonyms: string[];
}

export interface IngredientMatch {
  id: string;
  name: string;
  /** The name or synonym that matched, to show why it came up. */
  matched: string;
  score: number;
}

/**
 * Autocomplete under "Other allergy": the waiter types, PlateGuard suggests ingredients the
 * restaurant uses. Case and accents are ignored. Ranking: exact name or synonym, then words that
 * start with the query, then any substring. The waiter can always keep their own text instead.
 */
export function searchIngredients(
  query: string,
  ingredients: SearchableIngredient[],
  limit = 8,
): IngredientMatch[] {
  const q = normalizeLabel(query);
  if (q.length < 2) return [];
  const results: IngredientMatch[] = [];
  for (const ing of ingredients) {
    let best: IngredientMatch | null = null;
    for (const term of [ing.name, ...ing.synonyms]) {
      const t = normalizeLabel(term);
      const score =
        t === q
          ? 3
          : t.startsWith(q) || t.split(' ').some((w) => w.startsWith(q))
            ? 2
            : t.includes(q)
              ? 1
              : 0;
      // The real name wins a tie over a synonym.
      if (score > 0 && (!best || score > best.score))
        best = { id: ing.id, name: ing.name, matched: term, score };
    }
    if (best) results.push(best);
  }
  return results
    .sort(
      (a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}
