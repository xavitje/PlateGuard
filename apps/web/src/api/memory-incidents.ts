import type { IncidentDetail, IncidentReport } from '@plateguard/contracts';
import { ApiError, type AdminClient } from './client';

type IncidentAdmin = Pick<
  AdminClient,
  'incidents' | 'incident' | 'followUpIncident' | 'incidentPdf'
>;

/** Incidents for the demo and tests. The snapshot holds only what the report itself says. */
export function createMemoryIncidents(reporter: string): {
  report: (table: string, body: IncidentReport) => { id: string };
  admin: IncidentAdmin;
} {
  const list: IncidentDetail[] = [];
  let next = 1;
  const find = (id: string) => {
    const i = list.find((x) => x.id === id);
    if (!i) throw new ApiError(404, 'INCIDENT_NOT_FOUND');
    return i;
  };
  return {
    report: (table, body) => {
      const id = `incident-${next++}`;
      list.unshift({
        id,
        reportedAt: new Date().toISOString(),
        table,
        seat: body.seat ?? null,
        kind: body.kind,
        severity: body.severity,
        status: 'OPEN',
        dishName: null,
        reportedBy: reporter,
        description: body.description,
        cause: null,
        measure: null,
        closedAt: null,
        closedBy: null,
        snapshot: { allergies: [], plate: null, checks: [], timeline: [] },
      });
      return { id };
    },
    admin: {
      incidents: async () => ({ incidents: structuredClone(list) }),
      incident: async (_, id) => structuredClone(find(id)),
      followUpIncident: async (_, id, body) => {
        const i = find(id);
        if (body.close && (!body.cause || !body.measure))
          throw new ApiError(400, 'INCIDENT_FOLLOW_UP_INCOMPLETE');
        Object.assign(i, {
          cause: body.cause || null,
          measure: body.measure || null,
          status: body.close ? 'CLOSED' : 'OPEN',
          closedAt: body.close ? new Date().toISOString() : null,
          closedBy: body.close ? reporter : null,
        });
        return structuredClone(i);
      },
      incidentPdf: async () => new Blob(['%PDF-'], { type: 'application/pdf' }),
    },
  };
}
