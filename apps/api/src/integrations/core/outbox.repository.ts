import { Injectable } from '@nestjs/common';
import { EVENT_SCHEMAS, type EventPayload, type EventType } from '@plateguard/contracts';
import type { TenantTx } from '@plateguard/db';

/**
 * Domain events go into the outbox in the same transaction as the change they describe,
 * so nothing is lost when a POS, KDS or subscriber is slow or down.
 */
@Injectable()
export class OutboxRepository {
  async enqueue<T extends EventType>(
    tx: TenantTx,
    organizationId: string,
    locationId: string | null,
    type: T,
    payload: EventPayload<T>,
  ): Promise<string> {
    const data = EVENT_SCHEMAS[type].parse(payload) as object;
    const row = await tx.outboxEvent.create({
      data: { organizationId, locationId, type, payload: data },
      select: { id: true },
    });
    return row.id;
  }
}
