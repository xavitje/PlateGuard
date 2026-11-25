import { EU14, type AllergenCode, type Outcome } from '@plateguard/domain';
import { z } from 'zod';

/**
 * The public allergen menu of a location. Only the published menu, and only what a guest needs:
 * dish names and, for the allergens they avoid, the outcome and the changes the kitchen can make.
 * Recipes themselves never leave the restaurant.
 */
export interface GuestMenuResponse {
  location: { name: string };
  /** False until the location publishes a menu: then there are no dishes. */
  published: boolean;
  dishes: GuestDish[];
}

export interface GuestDish {
  id: string;
  name: string;
  course: number;
  /** Only when the guest picked allergens to avoid. */
  outcome?: Outcome;
  /** What the kitchen leaves off or replaces for them, by component name. */
  changes?: { action: 'OMIT' | 'SUBSTITUTE'; componentName: string; substituteName?: string }[];
}

export const GuestAvoidZ = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').filter(Boolean) : []))
  .pipe(z.array(z.enum(EU14)).max(EU14.length))
  .transform((codes) => [...new Set(codes)] as AllergenCode[]);
