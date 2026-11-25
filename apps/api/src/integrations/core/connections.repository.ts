import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service.js';
import type { Connection } from './ports.js';
import { openSecrets } from './secrets.js';

export interface ConnectionRecord {
  connection: Connection;
  organizationId: string;
  active: boolean;
}

@Injectable()
export class ConnectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * An inbound webhook only carries a connection id, so the tenant is not known yet: this is
   * one of the few lookups outside row-level security. It returns nothing else.
   */
  findForWebhook(provider: string, connectionId: string): Promise<ConnectionRecord | null> {
    return this.find(connectionId, provider);
  }

  /** For handling stored messages, which carry only the connection id. */
  findById(connectionId: string): Promise<ConnectionRecord | null> {
    return this.find(connectionId);
  }

  private async find(connectionId: string, provider?: string): Promise<ConnectionRecord | null> {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID.test(connectionId)) return null;
    const row = await this.prisma.system().integrationConnection.findFirst({
      where: { id: connectionId, ...(provider ? { provider } : {}) },
    });
    if (!row) return null;
    return {
      organizationId: row.organizationId,
      active: row.status === 'ACTIVE',
      connection: {
        id: row.id,
        locationId: row.locationId,
        provider: row.provider,
        config: (row.config ?? {}) as Record<string, unknown>,
        secrets: openSecrets(row.encryptedSecrets),
      },
    };
  }
}
