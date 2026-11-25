import { z } from 'zod';

export const IncidentKindZ = z.enum(['REACTION', 'NEAR_MISS', 'OTHER']);
export type IncidentKind = z.infer<typeof IncidentKindZ>;
export const IncidentSeverityZ = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type IncidentSeverity = z.infer<typeof IncidentSeverityZ>;

/** Reported from a table, optionally for one seat and one plate. */
export const IncidentReportZ = z.strictObject({
  seat: z.number().int().positive().max(50).optional(),
  plateId: z.uuid().optional(),
  kind: IncidentKindZ,
  severity: IncidentSeverityZ,
  description: z.string().trim().min(3).max(2000),
});
export type IncidentReport = z.infer<typeof IncidentReportZ>;

/** The manager's follow-up: cause and measure, and closing it when done. */
export const IncidentFollowUpZ = z.strictObject({
  cause: z.string().trim().max(2000),
  measure: z.string().trim().max(2000),
  close: z.boolean(),
});
export type IncidentFollowUp = z.infer<typeof IncidentFollowUpZ>;

export interface IncidentSummary {
  id: string;
  reportedAt: string;
  table: string;
  seat: number | null;
  kind: IncidentKind;
  severity: IncidentSeverity;
  status: 'OPEN' | 'CLOSED';
  dishName: string | null;
  reportedBy: string;
}

/** What was known when the incident was reported. Frozen: later changes do not alter it. */
export interface IncidentSnapshot {
  /** The seat's allergies as recorded then; codes, ingredients and own text, with severity. */
  allergies: { label: string; severity: string }[];
  plate: {
    dishName: string;
    status: string;
    course: number;
    orderedAt: string;
    outcome: string;
    /** The engine's reason codes and the menu version the plate was judged against. */
    reasons: unknown;
    engineVersion: string | null;
    menuVersionId: string | null;
    modifications: { action: string; component: string; substitute: string | null }[];
    rejectReason: string | null;
  } | null;
  checks: { kind: string; by: string; at: string }[];
  /** Every recorded step around this seat or plate, with who did it. */
  timeline: { at: string; type: string; by: string | null }[];
}

export interface IncidentDetail extends IncidentSummary {
  description: string;
  cause: string | null;
  measure: string | null;
  closedAt: string | null;
  closedBy: string | null;
  snapshot: IncidentSnapshot;
}

export interface IncidentsResponse {
  incidents: IncidentSummary[];
}
