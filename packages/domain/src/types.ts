import type { AllergenCode } from './allergens.js';

/** Per allergy, per guest. No severity chosen means SEVERE. */
export const SEVERITIES = ['INTOLERANCE', 'ALLERGY', 'SEVERE'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const DEFAULT_SEVERITY: Severity = 'SEVERE';

/**
 * Outcome of an assessment, ordered from best to worst.
 * For a plate, the worst outcome over all of the guest's allergies counts.
 */
export const OUTCOMES = [
  'CLEAR',
  'CLEAR_WITH_NOTE',
  'ADAPTABLE',
  'CAUTION',
  'UNKNOWN',
  'DO_NOT_SERVE',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export function worstOutcome(outcomes: Iterable<Outcome>): Outcome {
  let worst: Outcome = 'CLEAR';
  for (const o of outcomes) {
    if (OUTCOMES.indexOf(o) > OUTCOMES.indexOf(worst)) worst = o;
  }
  return worst;
}

export interface Ingredient {
  id: string;
  name: string;
  contains: AllergenCode[];
  mayContain: AllergenCode[];
  /** Verified against a source (brand, article number, by whom, when). Unverified is UNKNOWN. */
  verified: boolean;
}

/** Shared preparation equipment, such as fryer 1 or the grill. Its allergens become traces. */
export interface Equipment {
  id: string;
  name: string;
  allergens: AllergenCode[];
}

export interface Substitution {
  replacement: Component;
  /** Prepared separately, so usable for a SEVERE allergy. */
  suitableForSevere: boolean;
}

export interface Component {
  id: string;
  name: string;
  /** The kitchen may leave it off the plate. */
  omittable: boolean;
  /**
   * Already mixed into its parent or the dish before service (croutons through the salad,
   * stock in a batch-made jus). It cannot be left off or swapped; only its parent can.
   */
  premixed: boolean;
  /** Made separately, without cross-contact: usable as a substitute, or left off, for a SEVERE allergy. */
  suitableForSevere: boolean;
  preparedWith: Equipment[];
  ingredients: Ingredient[];
  components: Component[];
  substitutions: Substitution[];
}

export interface ResolvedDish {
  kind: 'dish';
  id: string;
  name: string;
  components: Component[];
}

/** A POS item without a mapping to a PlateGuard dish. Always UNKNOWN for an allergy guest. */
export interface UnmappedItem {
  kind: 'unmapped';
  externalId: string;
  name: string;
}

/**
 * One allergy of one guest. Three kinds, as many of each as needed, each with its own severity:
 * - a known allergen code (EU-14, a subtype or the organization's own),
 * - an ingredient from the restaurant's own list, picked by the waiter from the search under
 *   "Other allergy" (tomato, sunflower oil). The engine matches it against the recipes like an allergen,
 * - free text the waiter typed when nothing in the list fits. That has no link to the recipe data,
 *   so it always comes out UNKNOWN and the kitchen checks it by hand; the engine lists ingredients
 *   whose name looks like the label as hints.
 */
export type GuestAllergy =
  | { allergen: AllergenCode; ingredient?: undefined; custom?: undefined; severity?: Severity }
  | { ingredient: IngredientRef; allergen?: undefined; custom?: undefined; severity?: Severity }
  | { custom: string; allergen?: undefined; ingredient?: undefined; severity?: Severity };

/** An ingredient from the organization's ingredient list, as a guest allergy. */
export interface IngredientRef {
  id: string;
  /** Display name, for the ticket. Matching uses the id only. */
  name: string;
}

export type ModificationAction = 'OMIT' | 'SUBSTITUTE';

export interface Modification {
  /** Component ids from the dish down to the component that changes. */
  componentPath: string[];
  componentId: string;
  componentName: string;
  action: ModificationAction;
  substitute?: { id: string; name: string };
  /** The guest allergens that make this change mandatory. */
  reasonAllergens: AllergenCode[];
  /** The guest's ingredient allergies (ingredient ids) that make this change mandatory. */
  reasonIngredients: string[];
}

export type ReasonCode =
  | 'CONTAINS_RESOLVED'
  | 'CONTAINS_UNRESOLVED'
  | 'TRACES_NOTE'
  | 'TRACES_ASK_GUEST'
  | 'TRACES_COUNT_AS_CONTAINS'
  | 'UNVERIFIED_INGREDIENT'
  | 'UNMAPPED_ITEM'
  | 'CUSTOM_ALLERGY_MANUAL_CHECK'
  | 'CUSTOM_POSSIBLE_MATCH'
  | 'INGREDIENT_TRACES_MANUAL_CHECK'
  | 'NOT_FOUND';

/** Language neutral: the app translates codes, the audit stores them as they are. */
export interface Reason {
  code: ReasonCode;
  allergen?: AllergenCode;
  /** The waiter's label, for a custom allergy. */
  custom?: string;
  /** The guest's ingredient allergy this reason is about. */
  guestIngredientId?: string;
  componentId?: string;
  ingredientId?: string;
}

export interface AllergyResult {
  /** Set for a known allergen. */
  allergen?: AllergenCode;
  /** Set for an ingredient allergy. */
  ingredient?: IngredientRef;
  /** Set for a custom allergy. */
  custom?: string;
  severity: Severity;
  outcome: Outcome;
  reasons: Reason[];
}

/**
 * A check the recipe data cannot do:
 *  - CUSTOM: an allergy typed by the waiter, not in the recipes at all.
 *  - INGREDIENT_TRACES: a severe allergy to a picked ingredient. The recipes record the ingredient
 *    itself, but traces are recorded per allergen only, so traces of it are checked by hand.
 */
export interface ManualCheck {
  kind: 'CUSTOM' | 'INGREDIENT_TRACES';
  label: string;
  severity: Severity;
}

export interface Assessment {
  outcome: Outcome;
  /** Mandatory: printed on the allergy ticket, cannot be removed by the waiter. */
  modifications: Modification[];
  /** What the cook must check by hand before confirming the plate. */
  manualChecks: ManualCheck[];
  perAllergy: AllergyResult[];
  reasons: Reason[];
  engineVersion: string;
  /** sha256 over the canonical input, to prove later why a plate was released. */
  inputHash: string;
}

/** A change the waiter picked when ordering, for a component of the dish itself. */
export interface Choice {
  componentId: string;
  action: ModificationAction;
  /** The replacement component, with SUBSTITUTE. */
  substituteId?: string;
}

export interface AssessInput {
  dish: ResolvedDish | UnmappedItem;
  guest: GuestAllergy[];
  /** The waiter's picks. The engine takes them before its own, if they are safe. */
  choices?: Choice[];
  engineVersion?: string;
}
