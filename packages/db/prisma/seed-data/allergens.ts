/**
 * Official names of the 14 allergens of EU Regulation 1169/2011 (Annex II), with the built-in subtypes.
 * To add a language: add its names here. Codes must match DEFAULT_TAXONOMY in @plateguard/domain
 * (checked by packages/db/test/seed-data.test.ts).
 */
export interface AllergenSeed {
  code: string;
  parent?: string;
  names: Record<string, string>;
}

export const ALLERGEN_NAMES: AllergenSeed[] = [
  { code: 'GLUTEN', names: { en: 'Cereals containing gluten', nl: 'Glutenbevattende granen' } },
  { code: 'CRUSTACEANS', names: { en: 'Crustaceans', nl: 'Schaaldieren' } },
  { code: 'EGGS', names: { en: 'Eggs', nl: 'Eieren' } },
  { code: 'FISH', names: { en: 'Fish', nl: 'Vis' } },
  { code: 'PEANUTS', names: { en: 'Peanuts', nl: "Pinda's" } },
  { code: 'SOYBEANS', names: { en: 'Soybeans', nl: 'Soja' } },
  { code: 'MILK', names: { en: 'Milk', nl: 'Melk' } },
  { code: 'NUTS', names: { en: 'Tree nuts', nl: 'Noten' } },
  { code: 'CELERY', names: { en: 'Celery', nl: 'Selderij' } },
  { code: 'MUSTARD', names: { en: 'Mustard', nl: 'Mosterd' } },
  { code: 'SESAME', names: { en: 'Sesame seeds', nl: 'Sesamzaad' } },
  {
    code: 'SULPHITES',
    names: { en: 'Sulphur dioxide and sulphites', nl: 'Zwaveldioxide en sulfieten' },
  },
  { code: 'LUPIN', names: { en: 'Lupin', nl: 'Lupine' } },
  { code: 'MOLLUSCS', names: { en: 'Molluscs', nl: 'Weekdieren' } },

  { code: 'GLUTEN_WHEAT', parent: 'GLUTEN', names: { en: 'Wheat', nl: 'Tarwe' } },
  { code: 'GLUTEN_RYE', parent: 'GLUTEN', names: { en: 'Rye', nl: 'Rogge' } },
  { code: 'GLUTEN_BARLEY', parent: 'GLUTEN', names: { en: 'Barley', nl: 'Gerst' } },
  { code: 'GLUTEN_OATS', parent: 'GLUTEN', names: { en: 'Oats', nl: 'Haver' } },
  { code: 'GLUTEN_SPELT', parent: 'GLUTEN', names: { en: 'Spelt', nl: 'Spelt' } },
  { code: 'GLUTEN_KAMUT', parent: 'GLUTEN', names: { en: 'Kamut', nl: 'Kamut' } },
  { code: 'NUTS_ALMOND', parent: 'NUTS', names: { en: 'Almond', nl: 'Amandel' } },
  { code: 'NUTS_HAZELNUT', parent: 'NUTS', names: { en: 'Hazelnut', nl: 'Hazelnoot' } },
  { code: 'NUTS_WALNUT', parent: 'NUTS', names: { en: 'Walnut', nl: 'Walnoot' } },
  { code: 'NUTS_CASHEW', parent: 'NUTS', names: { en: 'Cashew', nl: 'Cashewnoot' } },
  { code: 'NUTS_PECAN', parent: 'NUTS', names: { en: 'Pecan', nl: 'Pecannoot' } },
  { code: 'NUTS_BRAZIL', parent: 'NUTS', names: { en: 'Brazil nut', nl: 'Paranoot' } },
  { code: 'NUTS_PISTACHIO', parent: 'NUTS', names: { en: 'Pistachio', nl: 'Pistachenoot' } },
  { code: 'NUTS_MACADAMIA', parent: 'NUTS', names: { en: 'Macadamia', nl: 'Macadamianoot' } },
];
