import type { PlateStatusName } from '@plateguard/contracts';
/**
 * Demo data for the tests, through the in-memory client. The app itself reads the seeded database through the API. Invented: Brasserie De Haven does not exist.
 * Allergen names come from the database per locale in production (AllergenTranslation).
 */
import type {
  Component,
  GuestAllergy,
  ResolvedDish,
  SearchableIngredient,
} from '@plateguard/domain';

export interface DemoTable {
  label: string;
  floor: string;
  seats: number;
  guests: number;
}

export const DEMO_FLOORS = ['Inside', 'Terrace'] as const;

export const DEMO_TABLES: DemoTable[] = [
  { label: '1', floor: 'Inside', seats: 2, guests: 2 },
  { label: '2', floor: 'Inside', seats: 4, guests: 0 },
  { label: '3', floor: 'Inside', seats: 4, guests: 3 },
  { label: '4', floor: 'Inside', seats: 2, guests: 2 },
  { label: '5', floor: 'Inside', seats: 4, guests: 0 },
  { label: '6', floor: 'Inside', seats: 6, guests: 5 },
  { label: '7', floor: 'Inside', seats: 4, guests: 4 },
  { label: '8', floor: 'Inside', seats: 2, guests: 0 },
  { label: '9', floor: 'Inside', seats: 4, guests: 2 },
  { label: '10', floor: 'Terrace', seats: 4, guests: 2 },
  { label: '11', floor: 'Terrace', seats: 2, guests: 0 },
  { label: '12', floor: 'Terrace', seats: 4, guests: 4 },
];

const ing = (
  id: string,
  name: string,
  contains: string[] = [],
  mayContain: string[] = [],
  verified = true,
) => ({
  id,
  name,
  contains,
  mayContain,
  verified,
});

const cmp = (c: Partial<Component> & Pick<Component, 'id' | 'name'>): Component => ({
  omittable: false,
  premixed: false,
  suitableForSevere: false,
  preparedWith: [],
  ingredients: [],
  components: [],
  substitutions: [],
  ...c,
});

const fryer = { id: 'eq-fryer', name: 'Fryer 1', allergens: ['FISH', 'CRUSTACEANS'] };
const gfJus = cmp({
  id: 'c-gfjus',
  name: 'GF jus',
  suitableForSevere: true,
  ingredients: [ing('i-starch', 'Corn starch')],
});

export const DEMO_DISHES: ResolvedDish[] = [
  {
    kind: 'dish',
    id: 'd-steak',
    name: 'Steak, jus and fries',
    components: [
      cmp({ id: 'c-steak', name: 'Steak', ingredients: [ing('i-beef', 'Beef')] }),
      cmp({
        id: 'c-jus',
        name: 'Jus',
        ingredients: [
          ing('i-flour', 'Wheat flour', ['GLUTEN_WHEAT']),
          ing('i-stock', 'Veal stock', ['CELERY']),
        ],
        substitutions: [{ replacement: gfJus, suitableForSevere: true }],
      }),
      cmp({
        id: 'c-fries',
        name: 'Fries',
        omittable: true,
        preparedWith: [fryer],
        ingredients: [ing('i-potato', 'Potato')],
      }),
    ],
  },
  {
    kind: 'dish',
    id: 'd-risotto',
    name: 'Mushroom risotto',
    components: [
      cmp({
        id: 'c-risotto',
        name: 'Risotto',
        premixed: true,
        ingredients: [ing('i-rice', 'Rice'), ing('i-butter', 'Butter', ['MILK'])],
      }),
    ],
  },
  {
    kind: 'dish',
    id: 'd-soup',
    name: 'Tomato soup',
    components: [
      cmp({ id: 'c-soup', name: 'Soup', ingredients: [ing('i-tomato', 'Tomato', [], ['CELERY'])] }),
    ],
  },
  {
    kind: 'dish',
    id: 'd-salad',
    name: 'Caesar salad',
    components: [
      cmp({ id: 'c-lettuce', name: 'Lettuce', ingredients: [ing('i-lettuce', 'Romaine')] }),
      cmp({
        id: 'c-croutons',
        name: 'Croutons',
        omittable: true,
        ingredients: [ing('i-bread', 'Bread', ['GLUTEN_WHEAT'])],
      }),
      cmp({
        id: 'c-dressing',
        name: 'Dressing',
        ingredients: [ing('i-anchovy', 'Anchovy', ['FISH']), ing('i-egg', 'Egg yolk', ['EGGS'])],
      }),
    ],
  },
  {
    kind: 'dish',
    id: 'd-special',
    name: 'Special: sea bass',
    components: [
      cmp({
        id: 'c-bass',
        name: 'Sea bass',
        ingredients: [ing('i-bass', 'Sea bass', ['FISH'], [], false)],
      }),
    ],
  },
];

export interface DemoSeat {
  allergies: GuestAllergy[];
  noAllergy: boolean;
  orders: { id: string; dishId: string; status?: PlateStatusName; rejectReason?: string }[];
}

/** Table label → seat number → what was recorded and ordered. */
export type DemoService = Record<string, Record<number, DemoSeat>>;

/** Plate ids unique across the restaurant, as the database has them. */
function withPlateIds(service: DemoService): DemoService {
  for (const [table, seats] of Object.entries(service))
    for (const [n, s] of Object.entries(seats))
      s.orders.forEach((o, i) => (o.id = `p-${table}-${n}-${i}`));
  return service;
}

const seat = (orders: string[], allergies: GuestAllergy[] = []): DemoSeat => ({
  allergies,
  noAllergy: allergies.length === 0,
  orders: orders.map((dishId, i) => ({ id: `${dishId}-${i}`, dishId })),
});

/**
 * What the waiters have entered so far. Alerts follow from these orders only: a seat with an
 * allergy gets an alert when a dish it ordered needs a change or cannot be served.
 */
export const DEMO_SERVICE: DemoService = withPlateIds({
  '12': {
    1: seat(['d-steak']),
    2: seat(['d-soup']),
    3: seat(
      ['d-steak'],
      [
        { allergen: 'GLUTEN', severity: 'SEVERE' },
        { allergen: 'MILK', severity: 'INTOLERANCE' },
      ],
    ),
    4: seat(['d-risotto']),
  },
  '7': {
    1: seat(['d-steak']),
    2: seat(['d-soup'], [{ ingredient: { id: 'i-tomato', name: 'Tomato' }, severity: 'ALLERGY' }]),
    3: seat(['d-salad']),
    4: seat(['d-risotto']),
  },
});

const SYNONYMS: Record<string, string[]> = {
  'i-tomato': ['tomaat', 'tomaten', 'tomatoes'],
  'i-potato': ['aardappel', 'patat'],
  'i-butter': ['boter'],
  'i-flour': ['tarwebloem', 'bloem'],
  'i-stock': ['kalfsfond', 'fond'],
  'i-anchovy': ['ansjovis'],
  'i-egg': ['eidooier', 'egg'],
  'i-lettuce': ['sla', 'lettuce'],
  'i-bass': ['zeebaars'],
  'i-rice': ['rijst'],
  'i-beef': ['rundvlees', 'biefstuk'],
  'i-starch': ['maizena', 'maiszetmeel'],
};

/** Every ingredient the demo restaurant uses, for the "Other allergy" search. */
export const DEMO_INGREDIENTS: SearchableIngredient[] = (() => {
  const seen = new Map<string, SearchableIngredient>();
  const walk = (c: Component) => {
    for (const i of c.ingredients)
      seen.set(i.id, { id: i.id, name: i.name, synonyms: SYNONYMS[i.id] ?? [] });
    c.components.forEach(walk);
    c.substitutions.forEach((s) => walk(s.replacement));
  };
  DEMO_DISHES.forEach((d) => d.components.forEach(walk));
  return [...seen.values()];
})();
