import { Injectable } from '@nestjs/common';
import type { Prisma, TenantContext } from '@plateguard/db';
import { PrismaService } from '../../common/prisma.service.js';

export const MAX_INBOX_ATTEMPTS = 5;

@Injectable()
export class InboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Stores the raw message once. A duplicate (same idempotency key) is ignored. Returns true if new. */
  async storeRaw(
    ctx: TenantContext,
    connectionId: string,
    locationId: string,
    idempotencyKey: string,
    payload: Prisma.InputJsonValue,
  ): Promise<boolean> {
    const result = await this.prisma.forTenant(ctx, (tx) =>
      tx.inboundEvent.createMany({
        data: [{ connectionId, locationId, idempotencyKey, payload }],
        skipDuplicates: true,
      }),
    );
    return result.count === 1;
  }

  /**
   * Claims a batch for a worker. SKIP LOCKED lets several workers run without taking the same rows.
   * Runs as the table owner: the worker serves every tenant and sets the tenant per event afterwards.
   */
  async claimBatch(limit = 20): Promise<{ id: string; connectionId: string; payload: unknown }[]> {
    return this.prisma.system().$queryRaw`
      UPDATE inbound_event SET status = 'PROCESSING', attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM inbound_event
        WHERE status IN ('PENDING', 'FAILED') AND attempts < ${MAX_INBOX_ATTEMPTS}
        ORDER BY received_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, connection_id AS "connectionId", payload`;
  }

  /** Claims this connection's waiting messages, oldest first, for handling right now. */
  claimFor(connectionId: string, limit = 20): Promise<{ id: string; payload: unknown }[]> {
    return this.prisma.system().$queryRaw`
      UPDATE inbound_event SET status = 'PROCESSING', attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM inbound_event
        WHERE connection_id = ${connectionId}::uuid
          AND status IN ('PENDING', 'FAILED') AND attempts < ${MAX_INBOX_ATTEMPTS}
        ORDER BY received_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, payload`;
  }

  async finish(
    id: string,
    outcome: { ok: true; result: Prisma.InputJsonValue } | { ok: false; error: string },
  ): Promise<void> {
    await this.prisma.system().inboundEvent.update({
      where: { id },
      data: outcome.ok
        ? { status: 'DONE', processedAt: new Date(), result: outcome.result, lastError: null }
        : { status: 'FAILED', lastError: outcome.error.slice(0, 500) },
    });
  }

  /** The last messages of a connection, for admin to see what came in. */
  recent(ctx: TenantContext, connectionId: string, take = 10) {
    return this.prisma.forTenant(ctx, (tx) =>
      tx.inboundEvent.findMany({
        where: { connectionId },
        orderBy: { receivedAt: 'desc' },
        take,
        select: {
          id: true,
          receivedAt: true,
          status: true,
          result: true,
          lastError: true,
          payload: true,
        },
      }),
    );
  }
}
