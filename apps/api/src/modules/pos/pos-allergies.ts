import type { CanonicalOrder } from '@plateguard/contracts';
import { allergiesFromText, normalizeLabel, type GuestAllergy } from '@plateguard/domain';

/** Hand-set meaning of a till button, by its normalized name: a code, or NONE. */
export type AllergyButtons = Record<string, string>;

export const buttonKey = (name: string) => normalizeLabel(name);

export function allergyButtonsOf(config: Record<string, unknown>): AllergyButtons {
  const raw = config.allergyButtons;
  return raw && typeof raw === 'object' ? (raw as AllergyButtons) : {};
}

/**
 * The allergies a till line carries: its buttons (as set by hand, else read by name) and
 * what the waiter typed on it.
 */
export function lineAllergies(
  line: CanonicalOrder['lines'][number],
  buttons: AllergyButtons,
): GuestAllergy[] {
  const out: GuestAllergy[] = [];
  const read: string[] = [];
  for (const m of line.modifiers) {
    const set = buttons[buttonKey(m)];
    if (set === 'NONE') continue;
    if (set) out.push({ allergen: set });
    else read.push(m);
  }
  out.push(...allergiesFromText(...read, line.note));
  return out;
}

export const allergyLabel = (a: GuestAllergy) => a.allergen ?? a.custom ?? a.ingredient?.name ?? '';

export const allergyKey = (a: GuestAllergy) =>
  a.allergen ?? (a.ingredient ? `i:${a.ingredient.id}` : `c:${normalizeLabel(a.custom ?? '')}`);
