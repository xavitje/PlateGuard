/**
 * The allergen engine. Pure: no database, no network, no clock.
 * The app runs it for instant feedback; the server runs the same code for the decision that counts.
 *
 * Fail-safe: when data is missing or doubtful, the answer is never "no allergen found".
 */
import {
  DEFAULT_TAXONOMY,
  allergenMatches,
  type AllergenCode,
  type AllergenTaxonomy,
} from './allergens.js';
import { inputHash } from './hash.js';
import {
  DEFAULT_SEVERITY,
  worstOutcome,
  type AllergyResult,
  type AssessInput,
  type Assessment,
  type Component,
  type GuestAllergy,
  type IngredientRef,
  type Modification,
  type Outcome,
  type Reason,
  type ResolvedDish,
  type Severity,
} from './types.js';

export const ENGINE_VERSION = '0.1.0';

type Level = 'none' | 'traces' | 'contains';

/** A known allergen or an ingredient allergy: both are matched against the recipe data. */
interface NormalizedAllergy {
  /** The allergen code, or "ingredient:<id>". */
  key: string;
  allergen?: AllergenCode;
  ingredient?: IngredientRef;
  severity: Severity;
}

interface Hit {
  level: Level;
  componentId: string;
  ingredientId?: string;
}

interface Ctx {
  allergies: NormalizedAllergy[];
  taxonomy: AllergenTaxonomy;
}

export interface EngineOptions {
  /** The organization's allergen tree, including its own allergens. Defaults to the EU-14 tree. */
  taxonomy?: AllergenTaxonomy;
}

interface CustomAllergy {
  /** Trimmed label as typed, first spelling wins. */
  label: string;
  severity: Severity;
}

/** Lower case, no accents, single spaces: "Tomaat " and "tomaat" are the same custom allergy. */
export function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeGuest(guest: GuestAllergy[]): {
  known: NormalizedAllergy[];
  custom: CustomAllergy[];
} {
  const known = new Map<string, NormalizedAllergy>();
  const custom = new Map<string, CustomAllergy>();
  for (const g of guest) {
    const severity = g.severity ?? DEFAULT_SEVERITY;
    if (g.custom !== undefined) {
      const key = normalizeLabel(g.custom);
      if (!key) continue;
      const existing = custom.get(key);
      if (!existing || severityRank(severity) > severityRank(existing.severity)) {
        custom.set(key, { label: existing?.label ?? g.custom.trim(), severity });
      }
      continue;
    }
    const entry: NormalizedAllergy =
      g.ingredient !== undefined
        ? {
            key: `ingredient:${g.ingredient.id}`,
            ingredient: { id: g.ingredient.id, name: g.ingredient.name },
            severity,
          }
        : { key: g.allergen, allergen: g.allergen, severity };
    const existing = known.get(entry.key);
    // The same allergy twice: keep the stricter severity.
    if (!existing || severityRank(severity) > severityRank(existing.severity)) {
      known.set(entry.key, entry);
    }
  }
  return {
    known: [...known.values()].sort((a, b) => a.key.localeCompare(b.key)),
    custom: [...custom.values()].sort((a, b) =>
      normalizeLabel(a.label).localeCompare(normalizeLabel(b.label)),
    ),
  };
}

function severityRank(s: Severity): number {
  return s === 'INTOLERANCE' ? 0 : s === 'ALLERGY' ? 1 : 2;
}

function maxLevel(a: Level, b: Level): Level {
  const rank = { none: 0, traces: 1, contains: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

/** Hits from the component's own ingredients and its preparation equipment, not its children. */
function ownHits(c: Component, a: NormalizedAllergy, ctx: Ctx): Hit[] {
  const hits: Hit[] = [];
  if (a.ingredient) {
    // An ingredient allergy hits where that ingredient is used. Traces of it are not recorded.
    for (const ing of c.ingredients) {
      if (ing.id === a.ingredient.id)
        hits.push({ level: 'contains', componentId: c.id, ingredientId: ing.id });
    }
    return hits;
  }
  const allergen = a.allergen!;
  const match = (code: AllergenCode) => allergenMatches(allergen, code, ctx.taxonomy);
  for (const ing of c.ingredients) {
    if (ing.contains.some(match)) {
      hits.push({ level: 'contains', componentId: c.id, ingredientId: ing.id });
    } else if (ing.mayContain.some(match)) {
      hits.push({ level: 'traces', componentId: c.id, ingredientId: ing.id });
    }
  }
  for (const eq of c.preparedWith) {
    if (eq.allergens.some(match)) hits.push({ level: 'traces', componentId: c.id });
  }
  return hits;
}

function deepHits(c: Component, a: NormalizedAllergy, ctx: Ctx): Hit[] {
  return [...ownHits(c, a, ctx), ...c.components.flatMap((sub) => deepHits(sub, a, ctx))];
}

function levelOf(hits: Hit[]): Level {
  return hits.reduce<Level>((acc, h) => maxLevel(acc, h.level), 'none');
}

/** Contains always needs a change; traces only for SEVERE, where traces count as contains. */
function needsAction(level: Level, severity: Severity): boolean {
  return level === 'contains' || (level === 'traces' && severity === 'SEVERE');
}

function hasUnverified(c: Component): boolean {
  return c.ingredients.some((i) => !i.verified) || c.components.some(hasUnverified);
}

/** A substitute must be free of every allergen of the guest, checked recursively, and fully verified. */
function isCleanFor(c: Component, ctx: Ctx): boolean {
  if (hasUnverified(c)) return false;
  return ctx.allergies.every((a) => {
    const level = levelOf(deepHits(c, a, ctx));
    return level === 'none' || (level === 'traces' && a.severity === 'INTOLERANCE');
  });
}

type Resolution =
  | { ok: true; modifications: Modification[] }
  | { ok: false; unresolved: { key: string; componentId: string }[] };

/**
 * Finds one action per component that satisfies all of the guest's allergies at once.
 * Order: fix inside the children, then substitute, then omit. If no single action satisfies
 * every allergy (for example omit is fine for gluten but not for a severe milk allergy),
 * the component is unresolved and the plate is DO_NOT_SERVE.
 */
function resolveComponent(c: Component, parentPath: string[], ctx: Ctx): Resolution {
  const path = [...parentPath, c.id];
  const needs = ctx.allergies.filter((a) => needsAction(levelOf(deepHits(c, a, ctx)), a.severity));
  if (needs.length === 0) return { ok: true, modifications: [] };

  const ownNeeds = needs.filter((a) => needsAction(levelOf(ownHits(c, a, ctx)), a.severity));
  if (ownNeeds.length === 0 && c.components.length > 0) {
    const children = c.components.map((sub) => resolveComponent(sub, path, ctx));
    if (children.every((r) => r.ok)) {
      return { ok: true, modifications: children.flatMap((r) => (r.ok ? r.modifications : [])) };
    }
  }

  const anySevere = needs.some((a) => a.severity === 'SEVERE');
  const reasonAllergens = needs.flatMap((a) => (a.allergen ? [a.allergen] : []));
  const reasonIngredients = needs.flatMap((a) => (a.ingredient ? [a.ingredient.id] : []));

  if (!c.premixed) {
    for (const sub of c.substitutions) {
      const severeOk = !anySevere || sub.suitableForSevere || sub.replacement.suitableForSevere;
      if (severeOk && isCleanFor(sub.replacement, ctx)) {
        return {
          ok: true,
          modifications: [
            {
              componentPath: path,
              componentId: c.id,
              componentName: c.name,
              action: 'SUBSTITUTE',
              substitute: { id: sub.replacement.id, name: sub.replacement.name },
              reasonAllergens,
              reasonIngredients,
            },
          ],
        };
      }
    }
  }

  // Leaving something off is not enough for SEVERE: that needs a substitute made separately.
  if (c.omittable && !c.premixed && !anySevere) {
    return {
      ok: true,
      modifications: [
        {
          componentPath: path,
          componentId: c.id,
          componentName: c.name,
          action: 'OMIT',
          reasonAllergens,
          reasonIngredients,
        },
      ],
    };
  }

  return { ok: false, unresolved: needs.map((a) => ({ key: a.key, componentId: c.id })) };
}

/** The plate as it will be served: modifications applied. */
function servedComponents(
  components: Component[],
  mods: Modification[],
  parentPath: string[] = [],
): Component[] {
  const out: Component[] = [];
  for (const c of components) {
    const path = [...parentPath, c.id];
    const mod = mods.find((m) => samePath(m.componentPath, path));
    if (mod?.action === 'OMIT') continue;
    if (mod?.action === 'SUBSTITUTE') {
      const sub = c.substitutions.find((s) => s.replacement.id === mod.substitute?.id);
      if (sub) out.push(sub.replacement);
      continue;
    }
    out.push({ ...c, components: servedComponents(c.components, mods, path) });
  }
  return out;
}

function samePath(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function unverifiedReasons(components: Component[]): Reason[] {
  return components.flatMap((c) => [
    ...c.ingredients
      .filter((i) => !i.verified)
      .map((i): Reason => ({
        code: 'UNVERIFIED_INGREDIENT',
        componentId: c.id,
        ingredientId: i.id,
      })),
    ...unverifiedReasons(c.components),
  ]);
}

function subjectOf(a: NormalizedAllergy): Pick<Reason, 'allergen' | 'guestIngredientId'> {
  return a.ingredient ? { guestIngredientId: a.ingredient.id } : { allergen: a.allergen! };
}

function resultSubject(a: NormalizedAllergy): Pick<AllergyResult, 'allergen' | 'ingredient'> {
  return a.ingredient ? { ingredient: a.ingredient } : { allergen: a.allergen! };
}

function causedBy(m: Modification, a: NormalizedAllergy): boolean {
  return a.ingredient
    ? m.reasonIngredients.includes(a.ingredient.id)
    : m.reasonAllergens.includes(a.allergen!);
}

function assessDish(dish: ResolvedDish, ctx: Ctx) {
  const modifications: Modification[] = [];
  const unresolved: { key: string; componentId: string }[] = [];
  for (const c of dish.components) {
    const r = resolveComponent(c, [], ctx);
    if (r.ok) modifications.push(...r.modifications);
    else unresolved.push(...r.unresolved);
  }

  const served = servedComponents(dish.components, modifications);
  const unverified = unverifiedReasons(served);

  const perAllergy: AllergyResult[] = ctx.allergies.map((a) => {
    const reasons: Reason[] = [];
    const outcomes: Outcome[] = ['CLEAR'];
    const who = subjectOf(a);

    for (const u of unresolved.filter((u) => u.key === a.key)) {
      reasons.push({ code: 'CONTAINS_UNRESOLVED', ...who, componentId: u.componentId });
      outcomes.push('DO_NOT_SERVE');
    }
    for (const m of modifications.filter((m) => causedBy(m, a))) {
      reasons.push({ code: 'CONTAINS_RESOLVED', ...who, componentId: m.componentId });
      outcomes.push('ADAPTABLE');
    }

    for (const hit of served.flatMap((c) => deepHits(c, a, ctx))) {
      const base = {
        ...who,
        componentId: hit.componentId,
        ...(hit.ingredientId ? { ingredientId: hit.ingredientId } : {}),
      };
      if (hit.level === 'contains' || a.severity === 'SEVERE') {
        // Should already be unresolved above; kept as a fail-safe.
        reasons.push({
          code: hit.level === 'contains' ? 'CONTAINS_UNRESOLVED' : 'TRACES_COUNT_AS_CONTAINS',
          ...base,
        });
        outcomes.push('DO_NOT_SERVE');
      } else if (a.severity === 'ALLERGY') {
        reasons.push({ code: 'TRACES_ASK_GUEST', ...base });
        outcomes.push('CAUTION');
      } else {
        reasons.push({ code: 'TRACES_NOTE', ...base });
        outcomes.push('CLEAR_WITH_NOTE');
      }
    }

    if (unverified.length > 0) {
      reasons.push(...unverified);
      outcomes.push('UNKNOWN');
    }
    if (reasons.length === 0) reasons.push({ code: 'NOT_FOUND', ...who });

    return { ...resultSubject(a), severity: a.severity, outcome: worstOutcome(outcomes), reasons };
  });

  return { modifications, perAllergy };
}

/** Ingredients and components whose name contains the label: hints for the kitchen, not a verdict. */
function nameHints(components: Component[], label: string): Reason[] {
  const needle = normalizeLabel(label);
  return components.flatMap((c) => [
    ...(normalizeLabel(c.name).includes(needle)
      ? [{ code: 'CUSTOM_POSSIBLE_MATCH' as const, custom: label, componentId: c.id }]
      : []),
    ...c.ingredients
      .filter((i) => normalizeLabel(i.name).includes(needle))
      .map((i): Reason => ({
        code: 'CUSTOM_POSSIBLE_MATCH',
        custom: label,
        componentId: c.id,
        ingredientId: i.id,
      })),
    ...nameHints(c.components, label),
  ]);
}

/**
 * A custom allergy is never matched automatically: recipes record allergen codes, not every
 * possible food. The outcome is UNKNOWN so the kitchen checks the plate by hand.
 */
function assessCustom(custom: CustomAllergy, served: Component[]): AllergyResult {
  return {
    custom: custom.label,
    severity: custom.severity,
    outcome: 'UNKNOWN',
    reasons: [
      { code: 'CUSTOM_ALLERGY_MANUAL_CHECK', custom: custom.label },
      ...nameHints(served, custom.label),
    ],
  };
}

export function assess(input: AssessInput, options: EngineOptions = {}): Assessment {
  const engineVersion = input.engineVersion ?? ENGINE_VERSION;
  const taxonomy = options.taxonomy ?? DEFAULT_TAXONOMY;
  const guest = normalizeGuest(input.guest);
  const ctx: Ctx = { allergies: guest.known, taxonomy };
  const hash = inputHash({ dish: input.dish, guest, engineVersion, taxonomy });

  let modifications: Modification[] = [];
  let perAllergy: AllergyResult[];

  if (input.dish.kind === 'unmapped') {
    perAllergy = [
      ...ctx.allergies.map((a): AllergyResult => ({
        ...resultSubject(a),
        severity: a.severity,
        outcome: 'UNKNOWN',
        reasons: [{ code: 'UNMAPPED_ITEM', ...subjectOf(a) }],
      })),
      ...guest.custom.map((c): AllergyResult => ({
        custom: c.label,
        severity: c.severity,
        outcome: 'UNKNOWN',
        reasons: [{ code: 'UNMAPPED_ITEM', custom: c.label }],
      })),
    ];
  } else {
    ({ modifications, perAllergy } = assessDish(input.dish, ctx));
    const served = servedComponents(input.dish.components, modifications);
    perAllergy.push(...guest.custom.map((c) => assessCustom(c, served)));
  }

  const outcome = worstOutcome(perAllergy.map((r) => r.outcome));
  // A plate that cannot go out carries no checklist: the ticket says DO NOT SERVE or UNKNOWN instead.
  // An UNKNOWN that comes only from custom allergies keeps its checklist: the kitchen checks those by hand.
  const blocked = perAllergy.some(
    (r) => r.outcome === 'DO_NOT_SERVE' || (r.outcome === 'UNKNOWN' && r.custom === undefined),
  );
  if (blocked) modifications = [];
  const manualChecks = guest.custom.map((c) => ({ custom: c.label, severity: c.severity }));

  return {
    outcome,
    modifications,
    manualChecks,
    perAllergy,
    reasons: perAllergy.flatMap((r) => r.reasons),
    engineVersion,
    inputHash: hash,
  };
}

/**
 * An override exists only for intolerance, by a manager, with the guest's consent and a reason.
 * Never for ALLERGY or SEVERE, and never for UNKNOWN: unknown is fixed in the data.
 */
export function isOverridable(assessment: Assessment): boolean {
  if (assessment.outcome !== 'DO_NOT_SERVE') return false;
  return assessment.perAllergy.every(
    (r) =>
      r.outcome !== 'UNKNOWN' && (r.outcome !== 'DO_NOT_SERVE' || r.severity === 'INTOLERANCE'),
  );
}
