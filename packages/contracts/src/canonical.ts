/**
 * The internal format every adapter translates to and from. The core never sees a POS brand.
 */
import { z } from 'zod';
import { AllergenCodeZ, GuestAllergyZ, SeverityZ } from './common.js';

export const CanonicalMenuItemZ = z.object({
  externalId: z.string(),
  name: z.string(),
  category: z.string().optional(),
  priceCents: z.number().int().optional(),
});
export type CanonicalMenuItem = z.infer<typeof CanonicalMenuItemZ>;

export const CanonicalOrderLineZ = z.object({
  externalLineId: z.string(),
  externalItemId: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  seat: z.number().int().positive().optional(),
  course: z.number().int().nonnegative().optional(),
  modifiers: z.array(z.string()).default([]),
  /** What the waiter typed on the line in the till. Read for allergies ("geen noten"). */
  note: z.string().optional(),
});

export const CanonicalOrderZ = z.object({
  externalOrderId: z.string(),
  externalTableRef: z.string().optional(),
  openedAt: z.iso.datetime(),
  /** Closed or cancelled orders add no plates. Missing: open. */
  status: z.enum(['OPEN', 'CLOSED', 'CANCELLED']).optional(),
  lines: z.array(CanonicalOrderLineZ),
  /** Only when the POS reports allergies per seat (capability order.allergens). */
  seatAllergies: z
    .array(
      z.object({
        seat: z.number().int().positive(),
        allergen: AllergenCodeZ,
        severity: SeverityZ.optional(),
      }),
    )
    .optional(),
});
export type CanonicalOrder = z.infer<typeof CanonicalOrderZ>;

export const KitchenTicketZ = z.object({
  plateId: z.uuid(),
  servicePoint: z.string(),
  seat: z.number().int().positive(),
  course: z.number().int().nonnegative(),
  dishName: z.string(),
  /** Codes are printed with their name in the location's kitchen language; custom labels as typed. */
  allergies: z.array(GuestAllergyZ),
  /**
   * What the cook checks by hand before confirming: custom allergies as typed, and traces of an
   * ingredient the guest is severely allergic to (traces are recorded per allergen only).
   */
  manualChecks: z.array(
    z.strictObject({ kind: z.enum(['CUSTOM', 'INGREDIENT_TRACES']), label: z.string().min(1) }),
  ),
  doNotServe: z.boolean(),
  modifications: z.array(z.string()),
  qrToken: z.string(),
  locale: z.string(),
});
export type KitchenTicket = z.infer<typeof KitchenTicketZ>;
