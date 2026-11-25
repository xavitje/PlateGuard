/**
 * Allergen codes are language neutral. Names live in the database per locale
 * (AllergenTranslation); this module only knows codes and the subtype tree.
 */

export const EU14 = [
  'GLUTEN',
  'CRUSTACEANS',
  'EGGS',
  'FISH',
  'PEANUTS',
  'SOYBEANS',
  'MILK',
  'NUTS',
  'CELERY',
  'MUSTARD',
  'SESAME',
  'SULPHITES',
  'LUPIN',
  'MOLLUSCS',
] as const;

export type Eu14Code = (typeof EU14)[number];

/** Built-in subtypes. An organization can add its own allergens and subtypes. */
export const EU14_SUBTYPES = {
  GLUTEN_WHEAT: 'GLUTEN',
  GLUTEN_RYE: 'GLUTEN',
  GLUTEN_BARLEY: 'GLUTEN',
  GLUTEN_OATS: 'GLUTEN',
  GLUTEN_SPELT: 'GLUTEN',
  GLUTEN_KAMUT: 'GLUTEN',
  NUTS_ALMOND: 'NUTS',
  NUTS_HAZELNUT: 'NUTS',
  NUTS_WALNUT: 'NUTS',
  NUTS_CASHEW: 'NUTS',
  NUTS_PECAN: 'NUTS',
  NUTS_BRAZIL: 'NUTS',
  NUTS_PISTACHIO: 'NUTS',
  NUTS_MACADAMIA: 'NUTS',
} as const satisfies Record<string, Eu14Code>;

/** Any allergen code: EU-14, a subtype, or an organization's own code. */
export type AllergenCode = string;

/**
 * The allergen tree as child -> parent. Codes without a parent are roots.
 * Pass an extended taxonomy to include an organization's own allergens.
 */
export type AllergenTaxonomy = Readonly<Record<AllergenCode, AllergenCode | null>>;

export const DEFAULT_TAXONOMY: AllergenTaxonomy = Object.freeze({
  ...Object.fromEntries(EU14.map((code) => [code, null])),
  ...EU14_SUBTYPES,
});

export function ancestorsOf(code: AllergenCode, taxonomy: AllergenTaxonomy): AllergenCode[] {
  const out: AllergenCode[] = [];
  const seen = new Set<AllergenCode>([code]);
  let parent = taxonomy[code] ?? null;
  while (parent !== null && !seen.has(parent)) {
    out.push(parent);
    seen.add(parent);
    parent = taxonomy[parent] ?? null;
  }
  return out;
}

/**
 * Does an ingredient labelled `ingredientCode` matter to a guest who reacts to `guestCode`?
 *
 * - Same code: yes.
 * - Ingredient is a subtype of the guest's allergen (hazelnut for a nut allergy): yes.
 * - Ingredient is a broader code than the guest's (plain "nuts" for a hazelnut allergy):
 *   yes, because "nuts" may well be hazelnut. Fail-safe.
 * - Siblings (almond for a hazelnut allergy): no.
 */
export function allergenMatches(
  guestCode: AllergenCode,
  ingredientCode: AllergenCode,
  taxonomy: AllergenTaxonomy = DEFAULT_TAXONOMY,
): boolean {
  if (guestCode === ingredientCode) return true;
  if (ancestorsOf(ingredientCode, taxonomy).includes(guestCode)) return true;
  if (ancestorsOf(guestCode, taxonomy).includes(ingredientCode)) return true;
  return false;
}
