import { GuestAllergyZ } from '@plateguard/contracts';
import type { AssessInput, Component } from '@plateguard/domain';
import { z } from 'zod';

const IngredientZ = z.object({
  id: z.string(),
  name: z.string(),
  contains: z.array(z.string()),
  mayContain: z.array(z.string()),
  verified: z.boolean(),
});

const ComponentZ: z.ZodType<Component> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    omittable: z.boolean(),
    premixed: z.boolean(),
    suitableForSevere: z.boolean(),
    preparedWith: z.array(
      z.object({ id: z.string(), name: z.string(), allergens: z.array(z.string()) }),
    ),
    ingredients: z.array(IngredientZ),
    components: z.array(ComponentZ),
    substitutions: z.array(z.object({ replacement: ComponentZ, suitableForSevere: z.boolean() })),
  }),
);

/** Preview input: a resolved dish (or an unmapped POS item) and the guest's allergies. */
export const AssessRequestZ: z.ZodType<AssessInput> = z.object({
  dish: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('dish'),
      id: z.string(),
      name: z.string(),
      components: z.array(ComponentZ),
    }),
    z.object({ kind: z.literal('unmapped'), externalId: z.string(), name: z.string() }),
  ]),
  guest: z.array(GuestAllergyZ).max(50),
});
