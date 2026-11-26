import { Injectable } from '@nestjs/common';
import { audit, type Prisma } from '@plateguard/db';
import { PrismaService } from '../../common/prisma.service.js';
import type { TenantContext } from '../auth/permissions.js';

export interface PosRow {
  id: string;
  status: string;
  provider: string;
  config: Record<string, unknown>;
  encryptedSecrets: Uint8Array | null;
}

/** The location's POS link and its item mapping. Everything goes through forTenant. */
@Injectable()
export class PosRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The location's current POS link, if any. */
  current(ctx: TenantContext, locationId: string): Promise<PosRow | null> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const row = await tx.integrationConnection.findFirst({
        where: { locationId, kind: 'POS', status: { in: ['ACTIVE', 'ERROR'] } },
        orderBy: { createdAt: 'desc' },
      });
      return row
        ? {
            id: row.id,
            status: row.status,
            provider: row.provider,
            config: (row.config ?? {}) as Record<string, unknown>,
            encryptedSecrets: row.encryptedSecrets,
          }
        : null;
    });
  }

  lastEventAt(ctx: TenantContext, connectionId: string): Promise<Date | null> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const e = await tx.inboundEvent.findFirst({
        where: { connectionId },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      });
      return e?.receivedAt ?? null;
    });
  }

  create(
    ctx: TenantContext,
    locationId: string,
    input: { provider: string; config: Prisma.InputJsonObject; secrets: Uint8Array },
  ): Promise<string> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const row = await tx.integrationConnection.create({
        data: {
          organizationId: ctx.organizationId,
          locationId,
          provider: input.provider,
          kind: 'POS',
          status: 'ACTIVE',
          capabilities: ['menu.read', 'order.read', 'order.webhook', 'order.seat'],
          config: input.config,
          encryptedSecrets: new Uint8Array(input.secrets),
          lastHealthAt: new Date(),
          lastHealthOk: true,
        },
      });
      // Only which system and location: never the secrets.
      await audit(tx, ctx, {
        locationId,
        type: 'integration.connected',
        entity: 'integration_connection',
        entityId: row.id,
        payload: { provider: input.provider },
      });
      return row.id;
    });
  }

  update(
    ctx: TenantContext,
    locationId: string,
    id: string,
    input: { config: Prisma.InputJsonObject; secrets?: Uint8Array },
    event: string,
  ): Promise<void> {
    return this.prisma.forTenant(ctx, async (tx) => {
      await tx.integrationConnection.update({
        where: { id, locationId },
        data: {
          config: input.config,
          ...(input.secrets ? { encryptedSecrets: new Uint8Array(input.secrets) } : {}),
        },
      });
      await audit(tx, ctx, {
        locationId,
        type: event,
        entity: 'integration_connection',
        entityId: id,
      });
    });
  }

  /** Disconnecting removes the secrets; the received messages and links to plates stay. */
  disable(ctx: TenantContext, locationId: string, id: string): Promise<void> {
    return this.prisma.forTenant(ctx, async (tx) => {
      await tx.integrationConnection.update({
        where: { id, locationId },
        data: { status: 'DISABLED', encryptedSecrets: null },
      });
      await audit(tx, ctx, {
        locationId,
        type: 'integration.disconnected',
        entity: 'integration_connection',
        entityId: id,
      });
    });
  }

  /** External item id → dish id, for items linked to a dish. */
  mappings(ctx: TenantContext, connectionId: string): Promise<Map<string, string>> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const rows = await tx.posItemMapping.findMany({
        where: { connectionId, dishId: { not: null } },
      });
      return new Map(rows.map((r) => [r.externalItemId, r.dishId!]));
    });
  }

  setMappings(
    ctx: TenantContext,
    locationId: string,
    connectionId: string,
    links: { externalItemId: string; dishId: string | null }[],
  ): Promise<void> {
    return this.prisma.forTenant(ctx, async (tx) => {
      for (const { externalItemId, dishId } of links) {
        const data = { dishId, confirmedById: ctx.userId ?? null, confirmedAt: new Date() };
        await tx.posItemMapping.upsert({
          where: { connectionId_externalItemId: { connectionId, externalItemId } },
          update: data,
          create: { connectionId, locationId, externalItemId, ...data },
        });
      }
      await audit(tx, ctx, {
        locationId,
        type: 'integration.items_mapped',
        entity: 'integration_connection',
        entityId: connectionId,
        payload: { links },
      });
    });
  }
}
