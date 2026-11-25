import { describe, expect, it } from 'vitest';
import { assess, isOverridable, type GuestAllergy, type Severity } from '../src/index.js';
import { component, dish, equipment, ingredient, simple, substitute } from './fixtures.js';

const guest = (allergen: string, severity?: Severity): GuestAllergy[] => [
  severity ? { allergen, severity } : { allergen },
];

/** Steak with a gluten jus. The jus can be swapped for a gluten-free jus. */
function steakWithJus(opts: {
  gfJusSevere: boolean;
  jusOmittable?: boolean;
  withSubstitute?: boolean;
}) {
  const gfJus = simple('GF jus', {}, { suitableForSevere: opts.gfJusSevere });
  const jus = component('Jus', {
    omittable: opts.jusOmittable ?? false,
    ingredients: [ingredient('Wheat flour', { contains: ['GLUTEN_WHEAT'] }), ingredient('Stock')],
    substitutions: opts.withSubstitute === false ? [] : [substitute(gfJus)],
  });
  return dish('Steak', [simple('Steak', {}), jus]);
}

describe('decision table: contains the allergen, solvable', () => {
  const croutonSalad = () =>
    dish('Salad', [
      simple('Lettuce', {}),
      simple('Croutons', { contains: ['GLUTEN_WHEAT'] }, { omittable: true }),
    ]);

  it('INTOLERANCE: adaptable by leaving it off', () => {
    const a = assess({ dish: croutonSalad(), guest: guest('GLUTEN', 'INTOLERANCE') });
    expect(a.outcome).toBe('ADAPTABLE');
    expect(a.modifications).toMatchObject([
      { componentName: 'Croutons', action: 'OMIT', reasonAllergens: ['GLUTEN'] },
    ]);
  });

  it('ALLERGY: adaptable by leaving it off', () => {
    const a = assess({ dish: croutonSalad(), guest: guest('GLUTEN', 'ALLERGY') });
    expect(a.outcome).toBe('ADAPTABLE');
    expect(a.modifications[0]?.action).toBe('OMIT');
  });

  it('SEVERE: left off only when it is made separately', () => {
    const burger = (separate: boolean) =>
      dish('Burger', [
        simple('Patty', {}),
        simple('Cheddar', { contains: ['MILK'] }, { omittable: true, suitableForSevere: separate }),
      ]);
    expect(assess({ dish: burger(false), guest: guest('MILK', 'SEVERE') }).outcome).toBe(
      'DO_NOT_SERVE',
    );
    const a = assess({ dish: burger(true), guest: guest('MILK', 'SEVERE') });
    expect(a.outcome).toBe('ADAPTABLE');
    expect(a.modifications).toMatchObject([{ componentName: 'Cheddar', action: 'OMIT' }]);
  });

  it('SEVERE: adaptable only with a substitute that is suitable for severe', () => {
    const a = assess({
      dish: steakWithJus({ gfJusSevere: true }),
      guest: guest('GLUTEN', 'SEVERE'),
    });
    expect(a.outcome).toBe('ADAPTABLE');
    expect(a.modifications).toMatchObject([
      { componentName: 'Jus', action: 'SUBSTITUTE', substitute: { name: 'GF jus' } },
    ]);
  });

  it('SEVERE: a substitute that is not suitable for severe means do not serve', () => {
    const a = assess({
      dish: steakWithJus({ gfJusSevere: false }),
      guest: guest('GLUTEN', 'SEVERE'),
    });
    expect(a.outcome).toBe('DO_NOT_SERVE');
    expect(a.modifications).toEqual([]);
  });

  it('SEVERE: leaving it off is not enough', () => {
    const a = assess({ dish: croutonSalad(), guest: guest('GLUTEN', 'SEVERE') });
    expect(a.outcome).toBe('DO_NOT_SERVE');
  });

  it('a substitution flagged suitable for severe counts, even if the component itself is not', () => {
    const gfJus = simple('GF jus', {});
    const jus = component('Jus', {
      ingredients: [ingredient('Wheat flour', { contains: ['GLUTEN'] })],
      substitutions: [substitute(gfJus, true)],
    });
    expect(assess({ dish: dish('Steak', [jus]), guest: guest('GLUTEN', 'SEVERE') }).outcome).toBe(
      'ADAPTABLE',
    );
  });
});

describe('decision table: contains the allergen, not solvable', () => {
  const risotto = () =>
    dish('Mushroom risotto', [simple('Risotto base', { contains: ['MILK'] }, { premixed: true })]);

  it('INTOLERANCE: do not serve, with an override possible', () => {
    const a = assess({ dish: risotto(), guest: guest('MILK', 'INTOLERANCE') });
    expect(a.outcome).toBe('DO_NOT_SERVE');
    expect(isOverridable(a)).toBe(true);
  });

  it('ALLERGY: do not serve, no override', () => {
    const a = assess({ dish: risotto(), guest: guest('MILK', 'ALLERGY') });
    expect(a.outcome).toBe('DO_NOT_SERVE');
    expect(isOverridable(a)).toBe(false);
  });

  it('SEVERE: do not serve, no override', () => {
    const a = assess({ dish: risotto(), guest: guest('MILK', 'SEVERE') });
    expect(a.outcome).toBe('DO_NOT_SERVE');
    expect(isOverridable(a)).toBe(false);
  });
});

describe('decision table: may contain traces', () => {
  const soup = () => dish('Tomato soup', [simple('Soup', { mayContain: ['CELERY'] })]);

  it('INTOLERANCE: no allergen found, with a note', () => {
    const a = assess({ dish: soup(), guest: guest('CELERY', 'INTOLERANCE') });
    expect(a.outcome).toBe('CLEAR_WITH_NOTE');
    expect(a.reasons.map((r) => r.code)).toContain('TRACES_NOTE');
  });

  it('ALLERGY: caution, ask the guest', () => {
    const a = assess({ dish: soup(), guest: guest('CELERY', 'ALLERGY') });
    expect(a.outcome).toBe('CAUTION');
    expect(a.reasons.map((r) => r.code)).toContain('TRACES_ASK_GUEST');
  });

  it('SEVERE: traces count as contains', () => {
    const a = assess({ dish: soup(), guest: guest('CELERY', 'SEVERE') });
    expect(a.outcome).toBe('DO_NOT_SERVE');
  });

  it('SEVERE: traces are solvable like contains, with a severe-suitable substitute', () => {
    const fries = component('Fries', {
      ingredients: [ingredient('Potato')],
      preparedWith: [equipment('Fryer 1', ['FISH'])],
      substitutions: [substitute(simple('Oven fries', {}, { suitableForSevere: true }))],
    });
    const a = assess({ dish: dish('Burger', [fries]), guest: guest('FISH', 'SEVERE') });
    expect(a.outcome).toBe('ADAPTABLE');
    expect(a.modifications[0]).toMatchObject({
      action: 'SUBSTITUTE',
      substitute: { name: 'Oven fries' },
    });
  });

  it('cross-contact from shared equipment gives traces', () => {
    const fries = component('Fries', {
      ingredients: [ingredient('Potato')],
      preparedWith: [equipment('Fryer 1', ['FISH', 'CRUSTACEANS'])],
    });
    const plate = dish('Burger', [fries]);
    expect(assess({ dish: plate, guest: guest('FISH', 'ALLERGY') }).outcome).toBe('CAUTION');
    expect(assess({ dish: plate, guest: guest('FISH', 'INTOLERANCE') }).outcome).toBe(
      'CLEAR_WITH_NOTE',
    );
  });
});

describe('decision table: unverified ingredient or unmapped POS item', () => {
  const unverified = () => dish('Special', [simple('Sauce', { verified: false })]);

  for (const severity of ['INTOLERANCE', 'ALLERGY', 'SEVERE'] as const) {
    it(`${severity}: unverified ingredient is unknown, never overridable`, () => {
      const a = assess({ dish: unverified(), guest: guest('GLUTEN', severity) });
      expect(a.outcome).toBe('UNKNOWN');
      expect(isOverridable(a)).toBe(false);
    });

    it(`${severity}: unmapped POS item is unknown`, () => {
      const a = assess({
        dish: { kind: 'unmapped', externalId: 'ls-991', name: 'Sea bass special' },
        guest: guest('FISH', severity),
      });
      expect(a.outcome).toBe('UNKNOWN');
      expect(a.reasons[0]?.code).toBe('UNMAPPED_ITEM');
    });
  }

  it('an unverified ingredient in a component that is left off does not matter', () => {
    const plate = dish('Salad', [
      simple('Lettuce', {}),
      component('Croutons', {
        omittable: true,
        ingredients: [
          ingredient('Bread', { contains: ['GLUTEN'] }),
          ingredient('Garlic oil', { verified: false }),
        ],
      }),
    ]);
    expect(assess({ dish: plate, guest: guest('GLUTEN', 'ALLERGY') }).outcome).toBe('ADAPTABLE');
  });

  it('do not serve wins over unknown', () => {
    const plate = dish('Special', [
      simple('Sauce', { verified: false }),
      simple('Base', { contains: ['MILK'] }, { premixed: true }),
    ]);
    expect(assess({ dish: plate, guest: guest('MILK', 'ALLERGY') }).outcome).toBe('DO_NOT_SERVE');
  });
});

describe('no hit', () => {
  it('is CLEAR ("no allergen found in the recipe"), never "safe"', () => {
    const a = assess({ dish: dish('Steak', [simple('Steak', {})]), guest: guest('GLUTEN') });
    expect(a.outcome).toBe('CLEAR');
    expect(a.reasons).toEqual([{ code: 'NOT_FOUND', allergen: 'GLUTEN' }]);
  });

  it('a guest without allergies gets CLEAR', () => {
    expect(assess({ dish: dish('Steak', [simple('Steak', {})]), guest: [] }).outcome).toBe('CLEAR');
  });
});

describe('subtypes', () => {
  const praline = () =>
    dish('Praline', [simple('Praline', { contains: ['NUTS_HAZELNUT'] }, { premixed: true })]);

  it('a nut allergy is hit by hazelnut', () => {
    expect(assess({ dish: praline(), guest: guest('NUTS', 'ALLERGY') }).outcome).toBe(
      'DO_NOT_SERVE',
    );
  });

  it('a hazelnut allergy is not hit by almond', () => {
    const plate = dish('Cake', [simple('Almond', { contains: ['NUTS_ALMOND'] })]);
    expect(assess({ dish: plate, guest: guest('NUTS_HAZELNUT', 'ALLERGY') }).outcome).toBe('CLEAR');
  });

  it('a hazelnut allergy is hit by unspecified nuts (fail-safe)', () => {
    const plate = dish('Cake', [simple('Mixed nuts', { contains: ['NUTS'] }, { premixed: true })]);
    expect(assess({ dish: plate, guest: guest('NUTS_HAZELNUT', 'ALLERGY') }).outcome).toBe(
      'DO_NOT_SERVE',
    );
  });

  it('supports an organization taxonomy with its own allergens', () => {
    const plate = dish('Curry', [simple('Paste', { contains: ['CORIANDER'] }, { premixed: true })]);
    const taxonomy = { CORIANDER: 'HERBS_OWN', HERBS_OWN: null };
    expect(
      assess({ dish: plate, guest: guest('HERBS_OWN', 'ALLERGY') }, { taxonomy }).outcome,
    ).toBe('DO_NOT_SERVE');
  });
});

describe('nested and premixed components', () => {
  it('expands nested components (jus contains stock)', () => {
    const stock = simple('Stock', { contains: ['CELERY'] }, { premixed: true });
    const jus = component('Jus', { components: [stock] });
    const plate = dish('Steak', [jus]);
    expect(assess({ dish: plate, guest: guest('CELERY', 'ALLERGY') }).outcome).toBe('DO_NOT_SERVE');
  });

  it('fixes a hit inside a child when the child can be swapped', () => {
    const garnish = simple(
      'Fried onions',
      { contains: ['GLUTEN'] },
      {
        substitutions: [substitute(simple('Chives', {}))],
      },
    );
    const topping = component('Topping', {
      ingredients: [ingredient('Herbs')],
      components: [garnish],
    });
    const a = assess({ dish: dish('Soup', [topping]), guest: guest('GLUTEN', 'ALLERGY') });
    expect(a.outcome).toBe('ADAPTABLE');
    expect(a.modifications[0]).toMatchObject({
      componentName: 'Fried onions',
      componentPath: [topping.id, garnish.id],
      action: 'SUBSTITUTE',
    });
  });

  it('a premixed component cannot be left off (croutons through the salad)', () => {
    const plate = dish('Caesar', [
      simple('Croutons', { contains: ['GLUTEN'] }, { omittable: true, premixed: true }),
    ]);
    expect(assess({ dish: plate, guest: guest('GLUTEN', 'INTOLERANCE') }).outcome).toBe(
      'DO_NOT_SERVE',
    );
  });

  it('a premixed child is resolved by swapping its parent', () => {
    const stock = simple('Stock', { contains: ['GLUTEN'] }, { premixed: true });
    const jus = component('Jus', {
      components: [stock],
      substitutions: [substitute(simple('GF jus', {}))],
    });
    const a = assess({ dish: dish('Steak', [jus]), guest: guest('GLUTEN', 'ALLERGY') });
    expect(a.modifications).toMatchObject([{ componentName: 'Jus', action: 'SUBSTITUTE' }]);
  });
});

describe('substitutes are checked against all allergens of the guest', () => {
  it('rejects a gluten-free substitute that contains milk for a guest with both', () => {
    const plate = steakWithJus({ gfJusSevere: true });
    const jus = plate.components[1]!;
    jus.substitutions = [
      substitute(simple('Cream jus', { contains: ['MILK'] }, { suitableForSevere: true })),
    ];
    const a = assess({
      dish: plate,
      guest: [{ allergen: 'GLUTEN' }, { allergen: 'MILK', severity: 'INTOLERANCE' }],
    });
    expect(a.outcome).toBe('DO_NOT_SERVE');
  });

  it('checks the substitute recursively', () => {
    const butter = simple('Butter', { contains: ['MILK'] });
    const gfJus = component('GF jus', { components: [butter], suitableForSevere: true });
    const plate = steakWithJus({ gfJusSevere: true });
    plate.components[1]!.substitutions = [substitute(gfJus)];
    const a = assess({
      dish: plate,
      guest: [{ allergen: 'GLUTEN' }, { allergen: 'MILK', severity: 'ALLERGY' }],
    });
    expect(a.outcome).toBe('DO_NOT_SERVE');
  });

  it('rejects an unverified substitute', () => {
    const plate = steakWithJus({ gfJusSevere: true });
    plate.components[1]!.substitutions = [
      substitute(simple('GF jus', { verified: false }, { suitableForSevere: true })),
    ];
    expect(assess({ dish: plate, guest: guest('GLUTEN') }).outcome).toBe('DO_NOT_SERVE');
  });
});

describe('conflicts and severity per allergy', () => {
  it('no single action for two allergies on one component means do not serve', () => {
    // Omitting works for gluten (intolerance), but milk is severe and needs a severe-suitable substitute.
    const sauce = component('Cream sauce', {
      omittable: true,
      ingredients: [
        ingredient('Roux', { contains: ['GLUTEN'] }),
        ingredient('Cream', { contains: ['MILK'] }),
      ],
      substitutions: [substitute(simple('Butter sauce', { contains: ['MILK'] }))],
    });
    const a = assess({
      dish: dish('Fish', [simple('Fish', {}), sauce]),
      guest: [
        { allergen: 'GLUTEN', severity: 'INTOLERANCE' },
        { allergen: 'MILK', severity: 'SEVERE' },
      ],
    });
    expect(a.outcome).toBe('DO_NOT_SERVE');
  });

  it('judges each allergy with its own severity and the worst counts (seat 3)', () => {
    const plate = dish('Steak with jus and cream sauce', [
      component('Jus', {
        ingredients: [ingredient('Wheat flour', { contains: ['GLUTEN_WHEAT'] })],
        substitutions: [substitute(simple('GF jus', {}, { suitableForSevere: true }))],
      }),
      simple('Cream sauce', { contains: ['MILK'] }, { omittable: true }),
      simple('Bread', { mayContain: ['MILK'] }),
    ]);
    const a = assess({
      dish: plate,
      guest: [
        { allergen: 'GLUTEN', severity: 'SEVERE' },
        { allergen: 'MILK', severity: 'INTOLERANCE' },
        { allergen: 'NUTS_HAZELNUT', severity: 'ALLERGY' },
      ],
    });
    expect(a.outcome).toBe('ADAPTABLE');
    expect(a.perAllergy.map((r) => [r.allergen, r.outcome])).toEqual([
      ['GLUTEN', 'ADAPTABLE'],
      ['MILK', 'ADAPTABLE'],
      ['NUTS_HAZELNUT', 'CLEAR'],
    ]);
    expect(a.modifications.map((m) => [m.componentName, m.action])).toEqual([
      ['Jus', 'SUBSTITUTE'],
      ['Cream sauce', 'OMIT'],
    ]);
  });

  it('no severity chosen means severe', () => {
    const soup = dish('Soup', [simple('Soup', { mayContain: ['CELERY'] })]);
    const a = assess({ dish: soup, guest: [{ allergen: 'CELERY' }] });
    expect(a.perAllergy[0]?.severity).toBe('SEVERE');
    expect(a.outcome).toBe('DO_NOT_SERVE');
  });

  it('the same allergen twice keeps the stricter severity', () => {
    const soup = dish('Soup', [simple('Soup', { mayContain: ['CELERY'] })]);
    const a = assess({
      dish: soup,
      guest: [
        { allergen: 'CELERY', severity: 'INTOLERANCE' },
        { allergen: 'CELERY', severity: 'ALLERGY' },
      ],
    });
    expect(a.outcome).toBe('CAUTION');
  });
});

describe('audit input', () => {
  const plate = () => dish('Steak', [simple('Steak', { id: 'i1' }, { id: 'c1' })]);

  it('records the engine version and a stable input hash', () => {
    const d = plate();
    const a = assess({
      dish: d,
      guest: [{ allergen: 'MILK' }, { allergen: 'GLUTEN', severity: 'ALLERGY' }],
    });
    const b = assess({
      dish: d,
      guest: [{ allergen: 'GLUTEN', severity: 'ALLERGY' }, { allergen: 'MILK' }],
    });
    expect(a.engineVersion).toBe('0.1.0');
    expect(a.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.inputHash).toBe(a.inputHash);
  });

  it('a different severity gives a different hash', () => {
    const d = plate();
    const a = assess({ dish: d, guest: guest('MILK', 'ALLERGY') });
    const b = assess({ dish: d, guest: guest('MILK', 'SEVERE') });
    expect(a.inputHash).not.toBe(b.inputHash);
  });

  it('does not mutate its input', () => {
    const d = steakWithJus({ gfJusSevere: true });
    const before = JSON.stringify(d);
    assess({ dish: d, guest: guest('GLUTEN') });
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe('custom allergies typed by the waiter', () => {
  const pasta = () =>
    dish('Pasta', [
      component('Tomato sauce', { ingredients: [ingredient('Tomato'), ingredient('Olive oil')] }),
      simple('Croutons', { contains: ['GLUTEN'] }, { omittable: true }),
    ]);

  it('is always unknown, with a manual check for the kitchen', () => {
    const a = assess({ dish: dish('Steak', [simple('Steak', {})]), guest: [{ custom: 'tomato' }] });
    expect(a.outcome).toBe('UNKNOWN');
    expect(a.perAllergy).toMatchObject([
      { custom: 'tomato', severity: 'SEVERE', outcome: 'UNKNOWN' },
    ]);
    expect(a.manualChecks).toEqual([{ kind: 'CUSTOM', label: 'tomato', severity: 'SEVERE' }]);
  });

  it('lists ingredients and components whose name looks like the label as hints', () => {
    const a = assess({ dish: pasta(), guest: [{ custom: 'Tomato', severity: 'ALLERGY' }] });
    const hints = a.reasons.filter((r) => r.code === 'CUSTOM_POSSIBLE_MATCH');
    expect(hints.length).toBe(2);
    expect(hints.every((h) => h.custom === 'Tomato')).toBe(true);
  });

  it('several custom allergies, each with its own severity, next to known allergens', () => {
    const a = assess({
      dish: pasta(),
      guest: [
        { allergen: 'GLUTEN', severity: 'ALLERGY' },
        { custom: 'tomato', severity: 'INTOLERANCE' },
        { custom: 'olive oil' },
      ],
    });
    expect(a.outcome).toBe('UNKNOWN');
    expect(a.perAllergy.map((r) => [r.allergen ?? r.custom, r.severity, r.outcome])).toEqual([
      ['GLUTEN', 'ALLERGY', 'ADAPTABLE'],
      ['olive oil', 'SEVERE', 'UNKNOWN'],
      ['tomato', 'INTOLERANCE', 'UNKNOWN'],
    ]);
    // The gluten change still goes on the ticket, next to the manual checks.
    expect(a.modifications).toMatchObject([{ componentName: 'Croutons', action: 'OMIT' }]);
    expect(a.manualChecks.map((m) => m.label)).toEqual(['olive oil', 'tomato']);
  });

  it('treats the same label in other spelling as one allergy, keeping the stricter severity', () => {
    const a = assess({
      dish: pasta(),
      guest: [
        { custom: 'Tomaat ', severity: 'INTOLERANCE' },
        { custom: 'tomaat', severity: 'SEVERE' },
      ],
    });
    expect(a.manualChecks).toEqual([{ kind: 'CUSTOM', label: 'Tomaat', severity: 'SEVERE' }]);
  });

  it('do not serve from a known allergen still wins', () => {
    const plate = dish('Risotto', [simple('Base', { contains: ['MILK'] }, { premixed: true })]);
    const a = assess({
      dish: plate,
      guest: [{ allergen: 'MILK', severity: 'ALLERGY' }, { custom: 'tomato' }],
    });
    expect(a.outcome).toBe('DO_NOT_SERVE');
    expect(isOverridable(a)).toBe(false);
  });

  it('changes the input hash', () => {
    const d = pasta();
    expect(assess({ dish: d, guest: [{ custom: 'tomato' }] }).inputHash).not.toBe(
      assess({ dish: d, guest: [{ custom: 'garlic' }] }).inputHash,
    );
  });
});

describe('ingredient allergies picked from the restaurant list', () => {
  const tomato = { id: 'ing-tomato', name: 'Tomato' };
  const sauce = () =>
    component('Tomato sauce', {
      ingredients: [ingredient('Tomato', { id: tomato.id }), ingredient('Olive oil')],
      substitutions: [substitute(simple('Pesto', {}, { suitableForSevere: true }))],
    });

  it('is matched against the recipes like an allergen, and resolved by a substitute', () => {
    const a = assess({
      dish: dish('Pasta', [sauce()]),
      guest: [{ ingredient: tomato, severity: 'ALLERGY' }],
    });
    expect(a.outcome).toBe('ADAPTABLE');
    expect(a.manualChecks).toEqual([]);
    expect(a.modifications).toMatchObject([
      {
        componentName: 'Tomato sauce',
        action: 'SUBSTITUTE',
        reasonAllergens: [],
        reasonIngredients: [tomato.id],
      },
    ]);
    expect(a.perAllergy).toMatchObject([{ ingredient: tomato, outcome: 'ADAPTABLE' }]);
  });

  it('finds the ingredient in nested components', () => {
    const base = component('Base', {
      premixed: true,
      ingredients: [ingredient('Tomato', { id: tomato.id })],
    });
    const plate = dish('Stew', [component('Stew', { components: [base] })]);
    expect(assess({ dish: plate, guest: [{ ingredient: tomato }] }).outcome).toBe('DO_NOT_SERVE');
  });

  it('is clear when the dish does not use the ingredient (intolerance or allergy)', () => {
    const plate = dish('Steak', [simple('Steak', {})]);
    for (const severity of ['INTOLERANCE', 'ALLERGY'] as const) {
      const a = assess({ dish: plate, guest: [{ ingredient: tomato, severity }] });
      expect(a.outcome).toBe('CLEAR');
      expect(a.manualChecks).toEqual([]);
    }
  });

  it('severe: traces are not recorded per ingredient, so the kitchen checks them by hand', () => {
    const plate = dish('Steak', [simple('Steak', {})]);
    const a = assess({ dish: plate, guest: [{ ingredient: tomato, severity: 'SEVERE' }] });
    expect(a.outcome).toBe('UNKNOWN');
    expect(a.reasons).toMatchObject([{ code: 'INGREDIENT_TRACES_MANUAL_CHECK' }]);
    expect(a.manualChecks).toEqual([
      { kind: 'INGREDIENT_TRACES', label: 'Tomato', severity: 'SEVERE' },
    ]);
    expect(isOverridable(a)).toBe(false);
  });

  it('severe: the ingredient itself is still fixed, and the change stays on the ticket', () => {
    const a = assess({
      dish: dish('Pasta', [sauce()]),
      guest: [{ ingredient: tomato, severity: 'SEVERE' }],
    });
    expect(a.outcome).toBe('UNKNOWN');
    expect(a.modifications).toMatchObject([
      { action: 'SUBSTITUTE', reasonIngredients: [tomato.id] },
    ]);
    expect(a.manualChecks).toMatchObject([{ kind: 'INGREDIENT_TRACES', label: 'Tomato' }]);
  });

  it('a substitute must be free of the ingredient too', () => {
    const s = component('Sauce', {
      ingredients: [ingredient('Tomato', { id: tomato.id })],
      substitutions: [
        substitute(
          component('Ketchup sauce', { ingredients: [ingredient('Tomato', { id: tomato.id })] }),
        ),
      ],
    });
    expect(
      assess({ dish: dish('Fries', [s]), guest: [{ ingredient: tomato, severity: 'ALLERGY' }] })
        .outcome,
    ).toBe('DO_NOT_SERVE');
  });

  it('combines with known allergens on one component', () => {
    const s = component('Sauce', {
      omittable: true,
      ingredients: [
        ingredient('Tomato', { id: tomato.id }),
        ingredient('Cream', { contains: ['MILK'] }),
      ],
    });
    const a = assess({
      dish: dish('Pasta', [simple('Pasta', {}), s]),
      guest: [
        { ingredient: tomato, severity: 'INTOLERANCE' },
        { allergen: 'MILK', severity: 'ALLERGY' },
      ],
    });
    expect(a.modifications).toMatchObject([
      {
        componentName: 'Sauce',
        action: 'OMIT',
        reasonAllergens: ['MILK'],
        reasonIngredients: [tomato.id],
      },
    ]);
  });
});
