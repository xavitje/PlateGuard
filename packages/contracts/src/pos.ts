import { z } from 'zod';

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
    .array(z.strictObject({ dishId: z.uuid(), seat: z.number().int().positive().max(50) }))
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
}

export interface PosEvent {
  id: string;
  receivedAt: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'DEAD';
  orderId: string | null;
  result: PosSyncResult | null;
  error: string | null;
}

export interface PosEventsResponse {
  events: PosEvent[];
}
