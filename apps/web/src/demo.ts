/**
 * Demo data for the app shell until the API serves real data. Invented: Brasserie De Haven does not exist.
 * Allergen names come from the database per locale in production (AllergenTranslation).
 */
import type { Component, GuestAllergy, ResolvedDish } from '@plateguard/domain';

export interface DemoTable {
  label: string;
  floor: string;
  seats: number;
  guests: number;
  allergyGuests: number;
  openAlerts: number;
}

export const DEMO_FLOORS = ['Inside', 'Terrace'] as const;

export const DEMO_TABLES: DemoTable[] = [
  { label: '1', floor: 'Inside', seats: 2, guests: 2, allergyGuests: 0, openAlerts: 0 },
  { label: '2', floor: 'Inside', seats: 4, guests: 0, allergyGuests: 0, openAlerts: 0 },
  { label: '3', floor: 'Inside', seats: 4, guests: 3, allergyGuests: 0, openAlerts: 0 },
  { label: '4', floor: 'Inside', seats: 2, guests: 2, allergyGuests: 0, openAlerts: 0 },
  { label: '5', floor: 'Inside', seats: 4, guests: 0, allergyGuests: 0, openAlerts: 0 },
  { label: '6', floor: 'Inside', seats: 6, guests: 5, allergyGuests: 0, openAlerts: 0 },
  { label: '7', floor: 'Inside', seats: 4, guests: 4, allergyGuests: 1, openAlerts: 1 },
  { label: '8', floor: 'Inside', seats: 2, guests: 0, allergyGuests: 0, openAlerts: 0 },
  { label: '9', floor: 'Inside', seats: 4, guests: 2, allergyGuests: 0, openAlerts: 0 },
  { label: '10', floor: 'Terrace', seats: 4, guests: 2, allergyGuests: 0, openAlerts: 0 },
  { label: '11', floor: 'Terrace', seats: 2, guests: 0, allergyGuests: 0, openAlerts: 0 },
  { label: '12', floor: 'Terrace', seats: 4, guests: 4, allergyGuests: 1, openAlerts: 2 },
];

export const DEMO_ALLERGEN_NAMES: Record<string, { en: string; nl: string }> = {
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
};

/** The quick picks on the seat screen. Anything else goes through "Other allergy". */
export const QUICK_ALLERGENS = ['GLUTEN', 'MILK', 'NUTS', 'PEANUTS', 'CELERY'];

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

export const DEMO_SEAT_ALLERGIES: Record<string, Record<number, GuestAllergy[]>> = {
  '12': {
    3: [
      { allergen: 'GLUTEN', severity: 'SEVERE' },
      { allergen: 'MILK', severity: 'INTOLERANCE' },
    ],
  },
  '7': { 2: [{ custom: 'Tomato', severity: 'ALLERGY' }] },
};

export interface DemoAlert {
  id: string;
  kind: 'stop' | 'warn' | 'unknown' | 'missed';
  table: string;
  text: { en: string; nl: string };
  minutesAgo: number;
}

export const DEMO_ALERTS: DemoAlert[] = [
  {
    id: 'a1',
    kind: 'stop',
    table: '12',
    text: {
      en: 'Seat 3 ordered mushroom risotto: do not serve',
      nl: 'Stoel 3 bestelde paddenstoelenrisotto: niet serveren',
    },
    minutesAgo: 2,
  },
  {
    id: 'a2',
    kind: 'warn',
    table: '12',
    text: {
      en: 'Seat 3: tomato soup may contain celery',
      nl: 'Stoel 3: tomatensoep kan selderij bevatten',
    },
    minutesAgo: 2,
  },
  {
    id: 'a3',
    kind: 'missed',
    table: '7',
    text: {
      en: 'Plate 4810 left the kitchen without a check',
      nl: 'Bord 4810 ging zonder check de keuken uit',
    },
    minutesAgo: 31,
  },
];
