import type { AllergenCode } from './allergens.js';
import { normalizeLabel } from './engine.js';
import type { GuestAllergy } from './types.js';

/**
 * Reads allergies out of what a waiter typed or tapped in their own till: a modifier
 * ("Allergie: melk"), a production instruction ("Notenallergie") or a free note ("geen noten
 * graag"). Dutch and English. A word only counts next to an allergy word (geen, zonder,
 * allergie, vrij, no, without, free, ...), so "extra kaas" or "met vis" is no allergy.
 *
 * Fail-safe: a clause that says allergy but names nothing known comes back as custom text,
 * so the kitchen checks it by hand. Everything found is SEVERE (the default) until a person
 * says otherwise.
 */

const TERMS: Record<string, AllergenCode[]> = {};
const add = (code: AllergenCode | AllergenCode[], ...words: string[]) => {
  for (const w of words) TERMS[w] = Array.isArray(code) ? code : [code];
};
add('GLUTEN', 'gluten', 'tarwe', 'wheat', 'coeliakie', 'celiac', 'coeliac');
add('CRUSTACEANS', 'schaaldier', 'schaaldieren', 'garnaal', 'garnalen', 'kreeft', 'krab');
add('CRUSTACEANS', 'crustacean', 'crustaceans', 'shrimp', 'prawn', 'prawns', 'crab', 'lobster');
add('EGGS', 'ei', 'eieren', 'egg', 'eggs');
add('FISH', 'vis', 'fish');
add('PEANUTS', 'pinda', 'pindas', 'peanut', 'peanuts', 'apennoot', 'apennoten');
add('NUTS', 'noot', 'noten', 'nut', 'nuts', 'notenmix');
add('NUTS_HAZELNUT', 'hazelnoot', 'hazelnoten', 'hazelnut', 'hazelnuts');
add('NUTS_WALNUT', 'walnoot', 'walnoten', 'walnut', 'walnuts');
add('NUTS_ALMOND', 'amandel', 'amandelen', 'almond', 'almonds');
add('NUTS_CASHEW', 'cashew', 'cashews', 'cashewnoot', 'cashewnoten');
add('NUTS_PISTACHIO', 'pistache', 'pistaches', 'pistachio', 'pistachios');
add('NUTS_PECAN', 'pecan', 'pecans', 'pecannoot', 'pecannoten');
add('NUTS_MACADAMIA', 'macadamia', 'macadamias');
add('NUTS_BRAZIL', 'paranoot', 'paranoten');
add('MILK', 'melk', 'koemelk', 'zuivel', 'lactose', 'milk', 'dairy');
add('SOYBEANS', 'soja', 'soy', 'soya');
add('CELERY', 'selderij', 'selderie', 'bleekselderij', 'knolselderij', 'celery', 'celeriac');
add('MUSTARD', 'mosterd', 'mustard');
add('SESAME', 'sesam', 'sesamzaad', 'sesame');
add('SULPHITES', 'sulfiet', 'sulfieten', 'sulphite', 'sulphites', 'sulfite', 'sulfites');
add('LUPIN', 'lupine', 'lupin');
add('MOLLUSCS', 'weekdier', 'weekdieren', 'schelpdier', 'schelpdieren', 'mossel', 'mosselen');
add('MOLLUSCS', 'oester', 'oesters', 'inktvis', 'octopus', 'calamari', 'mollusc', 'molluscs');
add('MOLLUSCS', 'mussel', 'mussels', 'oyster', 'oysters', 'squid', 'clam', 'clams');
// "Shellfish" means either in English: both, to be safe.
add(['CRUSTACEANS', 'MOLLUSCS'], 'shellfish');

/** Words that say "this is an allergy", on their own or glued to a term ("notenallergie"). */
const ALLERGY_WORDS = [
  'allergie',
  'allergieen',
  'allergisch',
  'allergy',
  'allergies',
  'allergic',
  'intolerant',
  'intolerantie',
  'intolerance',
];
const TRIGGERS = new Set([
  ...ALLERGY_WORDS,
  'geen',
  'zonder',
  'vrij',
  'no',
  'without',
  'free',
  'niet',
  'not',
]);
const SUFFIXES = ['allergie', 'allergisch', 'intolerantie', 'vrij', 'free'];
/** "Geen allergieën", "no allergies": says there is nothing. */
const NOTHING = /^(?:geen|no|none|zonder)\s+allerg/;

export function allergiesFromText(...texts: (string | undefined)[]): GuestAllergy[] {
  const found = new Map<string, GuestAllergy>();
  for (const text of texts) {
    if (!text) continue;
    for (const raw of text.split(/[,;.\n/|]+/)) {
      const clause = normalizeLabel(raw).replace(/'/g, '');
      if (!clause || NOTHING.test(clause)) continue;
      const words = clause.split(/[^a-z0-9]+/).filter(Boolean);
      let triggered = false;
      const codes: AllergenCode[] = [];
      for (const w of words) {
        if (TRIGGERS.has(w)) triggered = true;
        const direct = TERMS[w];
        if (direct) {
          codes.push(...direct);
          continue;
        }
        const suffix = SUFFIXES.find((s) => w.length > s.length && w.endsWith(s));
        const glued = suffix ? TERMS[w.slice(0, -suffix.length).replace(/-$/, '')] : undefined;
        if (glued) {
          codes.push(...glued);
          triggered = true;
        }
      }
      if (triggered && codes.length > 0) {
        for (const allergen of codes) found.set(`a:${allergen}`, { allergen });
      } else if (codes.length === 0 && words.some((w) => ALLERGY_WORDS.includes(w))) {
        // "Allergie kiwi": nothing known, so the cook reads the waiter's own words.
        const custom = raw.trim().replace(/\s+/g, ' ').slice(0, 60);
        found.set(`c:${clause}`, { custom });
      }
    }
  }
  return [...found.values()];
}
