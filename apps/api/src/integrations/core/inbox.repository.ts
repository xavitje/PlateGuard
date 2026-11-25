import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma, TenantContext } from '@plateguard/db';
import { PrismaService } from '../../common/prisma.service.js';

export const MAX_INBOX_ATTEMPTS = 5;
const REJECTED_PER_HOUR = 20;

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
   * Notes a message that was refused before it was stored, such as one with a wrong signature,
   * so admin can see that the POS did send something. It is never handled. Capped per hour, as
   * anyone who knows the address can send these.
   */
  async storeRejected(
    ctx: TenantContext,
    connectionId: string,
    locationId: string,
    code: string,
  ): Promise<void> {
    await this.prisma.forTenant(ctx, async (tx) => {
      const recent = await tx.inboundEvent.count({
        where: {
          connectionId,
          status: 'DEAD',
          receivedAt: { gt: new Date(Date.now() - 3600_000) },
        },
      });
      if (recent >= REJECTED_PER_HOUR) return;
      await tx.inboundEvent.create({
        data: {
          connectionId,
          locationId,
          idempotencyKey: `rejected:${randomUUID()}`,
          payload: { rejected: code },
          status: 'DEAD',
          lastError: code,
          processedAt: new Date(),
        },
      });
    });
  }

  /** Notes an order PlateGuard took in itself (a test order), so it shows in the same log. */
  async storeHandled(
    ctx: TenantContext,
    connectionId: string,
    locationId: string,
    idempotencyKey: string,
    payload: Prisma.InputJsonValue,
    result: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.forTenant(ctx, (tx) =>
      tx.inboundEvent.createMany({
        data: [
          {
            connectionId,
            locationId,
            idempotencyKey,
            payload,
            result,
            status: 'DONE',
            processedAt: new Date(),
          },
        ],
        skipDuplicates: true,
      }),
    );
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
  recent(ctx: TenantContext, connectionId: string, take = 20) {
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
