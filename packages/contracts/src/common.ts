import { OUTCOMES, SEVERITIES } from '@plateguard/domain';
import { z } from 'zod';

export const SeverityZ = z.enum(SEVERITIES);
export const OutcomeZ = z.enum(OUTCOMES);
export const AllergenCodeZ = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Allergen codes are UPPER_SNAKE_CASE');
export const IdZ = z.uuid();

/** A known allergen code, or a custom label the waiter typed ("tomato"). As many of each as needed. */
export const GuestAllergyZ = z.union([
  z.object({ allergen: AllergenCodeZ, severity: SeverityZ.default('SEVERE') }).strict(),
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
