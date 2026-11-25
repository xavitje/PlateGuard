import type { Prisma } from '@prisma/client';
import type { TenantContext, TenantTx } from './tenant.js';

export interface AuditInput {
  locationId: string | null;
  type: string;
  entity: string;
  entityId: string;
  payload?: Record<string, unknown>;
}

/**
 * Appends one event to the audit trail, in the caller's transaction, so the event exists exactly
 * when the change does. The table is append-only: a trigger refuses updates and deletes.
 */
export async function audit(tx: TenantTx, ctx: TenantContext, e: AuditInput): Promise<void> {
  await tx.auditEvent.create({
    data: {
      organizationId: ctx.organizationId,
      locationId: e.locationId,
      actorId: ctx.userId ?? null,
      type: e.type,
      entity: e.entity,
      entityId: e.entityId,
      payload: (e.payload ?? {}) as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}
