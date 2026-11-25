import { OUTCOMES, SEVERITIES } from '@plateguard/domain';
import { z } from 'zod';

export const SeverityZ = z.enum(SEVERITIES);
export const OutcomeZ = z.enum(OUTCOMES);
export const AllergenCodeZ = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Allergen codes are UPPER_SNAKE_CASE');
export const IdZ = z.uuid();

/**
 * A guest allergy: a known allergen code, an ingredient picked from the restaurant's list
 * ("Other allergy" search), or free text when nothing fits. As many of each as needed.
 */
export const GuestAllergyZ = z.union([
  z.object({ allergen: AllergenCodeZ, severity: SeverityZ.default('SEVERE') }).strict(),
  z
    .object({
      ingredient: z
        .object({ id: z.string().min(1), name: z.string().trim().min(1).max(120) })
        .strict(),
      severity: SeverityZ.default('SEVERE'),
    })
    .strict(),
  z
    .object({ custom: z.string().trim().min(1).max(60), severity: SeverityZ.default('SEVERE') })
    .strict(),
]);
export type GuestAllergyInput = z.infer<typeof GuestAllergyZ>;

/** API errors are codes; the app translates them. */
export const ApiErrorZ = z.object({
  code: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof ApiErrorZ>;
