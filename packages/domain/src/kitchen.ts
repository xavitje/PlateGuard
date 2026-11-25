import { normalizeLabel } from './engine.js';
import type { AllergyResult, Assessment, Severity } from './types.js';

/** Who an allergy is about: one of the three kinds, as the ticket prints it. */
export interface AllergySubject {
  allergen?: string;
  ingredient?: { id: string; name: string };
  custom?: string;
}

/**
 * One point on the allergy ticket that the cook ticks off before the plate goes to the pass.
 * Ids are stable for the same assessment, so the API can check that every point was ticked.
 */
export type ChecklistItem =
  | { id: string; kind: 'ALLERGY'; subject: AllergySubject; severity: Severity }
  | { id: string; kind: 'OMIT'; componentName: string }
  | { id: string; kind: 'SUBSTITUTE'; componentName: string; substituteName: string }
  | { id: string; kind: 'MANUAL'; check: 'CUSTOM' | 'INGREDIENT_TRACES'; label: string }
  | { id: string; kind: 'TRACES'; subject: AllergySubject };

/** Why a plate cannot be confirmed in the kitchen at all. */
export type KitchenBlock = 'DO_NOT_SERVE' | 'UNKNOWN_DATA';

const subjectKey = (s: AllergySubject) =>
  s.allergen ?? (s.ingredient ? `i:${s.ingredient.id}` : `c:${normalizeLabel(s.custom ?? '')}`);

const subjectOf = (r: AllergyResult): AllergySubject =>
  r.allergen
    ? { allergen: r.allergen }
    : r.ingredient
      ? { ingredient: r.ingredient }
      : { custom: r.custom ?? '' };

/**
 * A plate that the data says must not go out, or cannot judge (an unverified ingredient, an
 * unmapped POS item), is never confirmed: the cook rejects it back to the waiter.
 */
export function kitchenBlock(result: Assessment): KitchenBlock | null {
  if (result.perAllergy.some((r) => r.outcome === 'DO_NOT_SERVE')) return 'DO_NOT_SERVE';
  if (result.reasons.some((r) => r.code === 'UNVERIFIED_INGREDIENT' || r.code === 'UNMAPPED_ITEM'))
    return 'UNKNOWN_DATA';
  return null;
}

/**
 * Every risk point of a plate: each allergy of the guest, each change to the plate, each check by
 * hand, and each possible trace. The kitchen confirms a plate only with all of them ticked.
 */
export function kitchenChecklist(result: Assessment): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  for (const r of result.perAllergy) {
    const subject = subjectOf(r);
    items.push({
      id: `allergy:${subjectKey(subject)}`,
      kind: 'ALLERGY',
      subject,
      severity: r.severity,
    });
  }
  for (const m of result.modifications) {
    items.push(
      m.action === 'SUBSTITUTE'
        ? {
            id: `sub:${m.componentPath.join('/')}`,
            kind: 'SUBSTITUTE',
            componentName: m.componentName,
            substituteName: m.substitute?.name ?? '',
          }
        : { id: `omit:${m.componentPath.join('/')}`, kind: 'OMIT', componentName: m.componentName },
    );
  }
  for (const m of result.manualChecks)
    items.push({
      id: `manual:${m.kind}:${normalizeLabel(m.label)}`,
      kind: 'MANUAL',
      check: m.kind,
      label: m.label,
    });
  for (const r of result.perAllergy) {
    if (r.reasons.some((x) => x.code === 'TRACES_NOTE' || x.code === 'TRACES_ASK_GUEST')) {
      const subject = subjectOf(r);
      items.push({ id: `traces:${subjectKey(subject)}`, kind: 'TRACES', subject });
    }
  }
  return items;
}

/** The checklist points that were not ticked. Empty means the cook may confirm. */
export function uncheckedItems(items: ChecklistItem[], checked: Iterable<string>): ChecklistItem[] {
  const done = new Set(checked);
  return items.filter((i) => !done.has(i.id));
}
