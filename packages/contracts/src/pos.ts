import { z } from 'zod';
import { AllergenCodeZ } from './common.js';

/** Connecting a Square test account: the sandbox access token and the Square location. */
export const PosConnectInputZ = z.strictObject({
  accessToken: z.string().trim().min(20).max(500),
  squareLocationId: z.string().trim().min(4).max(100),
});
export type PosConnectInput = z.infer<typeof PosConnectInputZ>;

/** After making the webhook in Square: its signature key, and the URL exactly as given there. */
export const PosWebhookInputZ = z.strictObject({
  signatureKey: z.string().trim().min(8).max(200),
  url: z.url({ protocol: /^https?$/ }).max(500),
});
export type PosWebhookInput = z.infer<typeof PosWebhookInputZ>;

export const PosMappingInputZ = z.strictObject({
  externalItemId: z.string().min(1).max(200),
  dishId: z.uuid().nullable(),
});
export type PosMappingInput = z.infer<typeof PosMappingInputZ>;

/** A test order rung up in the Square sandbox the way a till would. */
export const PosTestOrderInputZ = z.strictObject({
  table: z.string().trim().min(1).max(20),
  lines: z
    .array(
      z.strictObject({
        dishId: z.uuid(),
        seat: z.number().int().positive().max(50),
        /** Typed on the line in the till, such as "notenallergie". */
        note: z.string().trim().max(120).optional(),
      }),
    )
    .min(1)
    .max(20),
});
export type PosTestOrderInput = z.infer<typeof PosTestOrderInputZ>;

export interface PosConnection {
  id: string;
  provider: string;
  status: 'ACTIVE' | 'ERROR';
  /** The Square location's name, as Square reports it. */
  locationName: string;
  squareLocationId: string;
  sandbox: boolean;
  /** Path of the webhook on this server; the browser adds its own origin. */
  webhookPath: string;
  /** The URL the webhook was saved with, or null before it was set up. */
  webhookUrl: string | null;
  lastEventAt: string | null;
}

export interface PosResponse {
  connection: PosConnection | null;
  /** False when the server has no INTEGRATION_SECRET_KEY: nothing can be connected yet. */
  secretsReady: boolean;
}

export interface PosItem {
  externalId: string;
  name: string;
  dishId: string | null;
}

export interface PosItemsResponse {
  items: PosItem[];
}

/** What handling one or more orders did. */
export interface PosSyncResult {
  orders: number;
  /** New plates placed on seats. */
  plates: number;
  /** Lines that were already placed before. */
  duplicates: number;
  /** Lines whose item is not linked to a dish. */
  unmapped: number;
  /** Lines without a seat. */
  noSeat: number;
  /** Orders without a known table. */
  noTable: number;
  /** Lines that could not be placed (seat not at the table, dish not on the menu). */
  failed: number;
  /** Of the new plates: on a seat without allergies, so not on the kitchen screen. */
  withoutAllergy: number;
}

/** What happened to one line of a POS order. */
export type PosLineOutcome =
  'PLACED' | 'PLACED_NO_ALLERGY' | 'DUPLICATE' | 'UNMAPPED' | 'NO_SEAT' | 'FAILED';

export interface PosLineLog {
  /** The item's name in the POS. */
  name: string;
  seat: number | null;
  quantity: number;
  outcome: PosLineOutcome;
  /** For FAILED: the error code, such as SEAT_NOT_AT_TABLE or DISH_NOT_FOUND. */
  reason?: string;
  /** Allergies the till gave for this line (button or note), added to the seat: codes or text. */
  fromPos?: string[];
}

/** Why a whole order was left alone. */
export type PosOrderSkip = 'CLOSED' | 'CANCELLED' | 'NO_TABLE' | 'TABLE_NOT_FOUND' | 'NOT_FOUND';

/** One order as PlateGuard handled it, line by line, for admin. */
export interface PosOrderLog {
  table: string | null;
  skipped: PosOrderSkip | null;
  lines: PosLineLog[];
}

export interface PosEvent {
  id: string;
  receivedAt: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'DEAD';
  /** WEBHOOK: sent by the till. TEST: a test order placed from admin. */
  source: 'WEBHOOK' | 'TEST';
  orderId: string | null;
  result: PosSyncResult | null;
  /** The order line by line. Missing for messages handled before this log existed. */
  order: PosOrderLog | null;
  /** A message refused before it was stored, such as WEBHOOK_SIGNATURE_INVALID. */
  rejected: string | null;
  error: string | null;
}

export interface PosEventsResponse {
  events: PosEvent[];
}

/**
 * How a modifier or till button counts as an allergy. A code: always that allergen. NONE: never
 * an allergy ("Extra kaas"). null: PlateGuard reads the name itself ("Allergie: melk").
 */
export const PosAllergyButtonInputZ = z.strictObject({
  name: z.string().trim().min(1).max(120),
  allergen: z.union([AllergenCodeZ, z.literal('NONE')]).nullable(),
});
export type PosAllergyButtonInput = z.infer<typeof PosAllergyButtonInputZ>;

export interface PosAllergyButton {
  /** The modifier's name in the till. */
  name: string;
  /** What PlateGuard reads in the name on its own: allergen codes, or the text for the cook. */
  recognized: string[];
  /** Set by hand; null when PlateGuard's own reading is used. */
  allergen: string | null;
}

export interface PosAllergyButtonsResponse {
  buttons: PosAllergyButton[];
}
