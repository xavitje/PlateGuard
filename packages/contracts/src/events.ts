/**
 * Outgoing domain events. Names carry a version; payloads never hold names or room numbers,
 * only service point and seat.
 */
import { z } from 'zod';
import { IdZ, OutcomeZ } from './common.js';

const plateRef = {
  plateId: IdZ,
  locationId: IdZ,
  servicePoint: z.string(),
  seat: z.number().int().positive(),
};

export const EVENT_SCHEMAS = {
  'plate.flagged.v1': z.object({
    ...plateRef,
    outcome: OutcomeZ,
    modifications: z.array(
      z.object({ componentId: z.string(), action: z.enum(['OMIT', 'SUBSTITUTE']) }),
    ),
  }),
  'plate.checked.v1': z.object({
    ...plateRef,
    byUserId: IdZ,
    at: z.iso.datetime(),
    method: z.enum(['SCAN', 'TAP', 'KDS']),
  }),
  'plate.pass_checked.v1': z.object({ ...plateRef, byUserId: IdZ, at: z.iso.datetime() }),
  'plate.rejected.v1': z.object({ ...plateRef, reason: z.string() }),
  'plate.check_missed.v1': z.object({ ...plateRef, at: z.iso.datetime() }),
  'menu.published.v1': z.object({
    menuId: IdZ,
    locationId: IdZ,
    version: z.number().int(),
    pdfUrl: z.url().optional(),
  }),
  'item.unmapped.v1': z.object({
    locationId: IdZ,
    connectionId: IdZ,
    externalItemId: z.string(),
    name: z.string(),
  }),
  'incident.created.v1': z.object({
    incidentId: IdZ,
    locationId: IdZ,
    severity: z.string(),
    plateIds: z.array(IdZ),
  }),
} as const;

export type EventType = keyof typeof EVENT_SCHEMAS;
export type EventPayload<T extends EventType> = z.infer<(typeof EVENT_SCHEMAS)[T]>;
export const EVENT_TYPES = Object.keys(EVENT_SCHEMAS) as EventType[];

export const EventEnvelopeZ = z.object({
  eventId: IdZ,
  type: z.enum(EVENT_TYPES as [EventType, ...EventType[]]),
  occurredAt: z.iso.datetime(),
  organizationId: IdZ,
  data: z.unknown(),
});
export type EventEnvelope = z.infer<typeof EventEnvelopeZ>;

export function parseEvent<T extends EventType>(type: T, data: unknown): EventPayload<T> {
  return EVENT_SCHEMAS[type].parse(data) as EventPayload<T>;
}

/** JSON Schema per event, so subscribers can validate payloads. */
export function eventJsonSchemas(): Record<EventType, unknown> {
  return Object.fromEntries(
    EVENT_TYPES.map((t) => [t, z.toJSONSchema(EVENT_SCHEMAS[t])]),
  ) as Record<EventType, unknown>;
}
