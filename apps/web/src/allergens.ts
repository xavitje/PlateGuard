/**
 * Allergen names for the app, until the API serves AllergenTranslation from the database.
 */
export const ALLERGEN_NAMES: Record<string, { en: string; nl: string }> = {
  GLUTEN: { en: 'Gluten', nl: 'Gluten' },
  MILK: { en: 'Milk', nl: 'Melk' },
  EGGS: { en: 'Eggs', nl: 'Ei' },
  NUTS: { en: 'Nuts', nl: 'Noten' },
  NUTS_HAZELNUT: { en: 'Hazelnut', nl: 'Hazelnoot' },
  PEANUTS: { en: 'Peanuts', nl: "Pinda's" },
  CELERY: { en: 'Celery', nl: 'Selderij' },
  FISH: { en: 'Fish', nl: 'Vis' },
  CRUSTACEANS: { en: 'Crustaceans', nl: 'Schaaldieren' },
  SESAME: { en: 'Sesame', nl: 'Sesam' },
  SOYBEANS: { en: 'Soy', nl: 'Soja' },
  MUSTARD: { en: 'Mustard', nl: 'Mosterd' },
  SULPHITES: { en: 'Sulphites', nl: 'Sulfiet' },
  LUPIN: { en: 'Lupin', nl: 'Lupine' },
  MOLLUSCS: { en: 'Molluscs', nl: 'Weekdieren' },
};

/** The quick picks on the seat screen. Anything else goes through "Other allergy". */
export const QUICK_ALLERGENS = ['GLUTEN', 'MILK', 'NUTS', 'PEANUTS', 'CELERY'];
