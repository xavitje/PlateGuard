import type { Component, Equipment, Ingredient, ResolvedDish, Substitution } from '../src/index.js';

let seq = 0;
const id = (prefix: string) => `${prefix}-${++seq}`;

export function ingredient(name: string, opts: Partial<Omit<Ingredient, 'name'>> = {}): Ingredient {
  return { id: opts.id ?? id('ing'), name, contains: [], mayContain: [], verified: true, ...opts };
}

export function equipment(name: string, allergens: string[]): Equipment {
  return { id: id('eq'), name, allergens };
}

export function component(name: string, opts: Partial<Omit<Component, 'name'>> = {}): Component {
  return {
    id: opts.id ?? id('cmp'),
    name,
    omittable: false,
    premixed: false,
    suitableForSevere: false,
    preparedWith: [],
    ingredients: [],
    components: [],
    substitutions: [],
    ...opts,
  };
}

export function substitute(replacement: Component, suitableForSevere = false): Substitution {
  return { replacement, suitableForSevere };
}

export function dish(name: string, components: Component[]): ResolvedDish {
  return { kind: 'dish', id: id('dish'), name, components };
}

/** A component that is a single ingredient. */
export function simple(
  name: string,
  ing: Partial<Omit<Ingredient, 'name'>>,
  opts: Partial<Component> = {},
) {
  return component(name, { ingredients: [ingredient(name, ing)], ...opts });
}
