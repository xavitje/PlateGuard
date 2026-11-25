import { EU14 } from './allergens.js';
import { assess } from './engine.js';
import type { Outcome, ResolvedDish } from './types.js';

/**
 * One cell of the allergen card: what a guest with this allergy can expect from the dish.
 * CONTAINS: in the dish and cannot be left out. ON_REQUEST: in the dish, but the kitchen can
 * leave it out or replace it. TRACES: may be present as a trace. UNKNOWN: the recipe data cannot
 * tell (an unverified ingredient). Null: none found.
 */
export type CardMark = 'CONTAINS' | 'ON_REQUEST' | 'TRACES' | 'UNKNOWN' | null;

const MARK: Record<Outcome, CardMark> = {
  DO_NOT_SERVE: 'CONTAINS',
  ADAPTABLE: 'ON_REQUEST',
  CAUTION: 'TRACES',
  CLEAR_WITH_NOTE: 'TRACES',
  UNKNOWN: 'UNKNOWN',
  CLEAR: null,
};

export interface CardRow {
  dish: Pick<ResolvedDish, 'id' | 'name'>;
  marks: Record<string, CardMark>;
}

/**
 * The legal allergen overview of a menu: each dish against each of the 14 EU allergens, judged
 * by the engine for a guest with that one allergy (not severe), so the card and the app agree.
 */
export function allergenCard(dishes: ResolvedDish[], codes: readonly string[] = EU14): CardRow[] {
  return dishes.map((dish) => ({
    dish: { id: dish.id, name: dish.name },
    marks: Object.fromEntries(
      codes.map((allergen) => [
        allergen,
        MARK[assess({ dish, guest: [{ allergen, severity: 'ALLERGY' }] }).outcome],
      ]),
    ),
  }));
}
