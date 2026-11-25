import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service.js';
import type { Connection } from './ports.js';

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
  async findForWebhook(provider: string, connectionId: string): Promise<ConnectionRecord | null> {
    const row = await this.prisma.system().integrationConnection.findFirst({
      where: { id: connectionId, provider },
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
        // Decryption of encryptedSecrets (per-connection key, rotatable) lands with the first real adapter.
        secrets: {},
      },
    };
  }
}
