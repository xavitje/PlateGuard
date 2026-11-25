import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AdapterRegistry } from './core/registry.js';
import { ConnectionsRepository } from './core/connections.repository.js';
import { InboxRepository } from './core/inbox.repository.js';
import { canVerifyWebhooks, type RawRequest } from './core/ports.js';

/**
 * Inbound webhook layer: verify, store raw, answer fast. Translation into domain events happens
 * later in the inbox worker, so a slow or broken payload never holds up the POS.
 */
@Injectable()
export class HooksService {
  constructor(
    private readonly registry: AdapterRegistry,
    private readonly connections: ConnectionsRepository,
    private readonly inbox: InboxRepository,
  ) {}

  async receive(
    provider: string,
    connectionId: string,
    req: RawRequest,
  ): Promise<{ stored: number; duplicates: number }> {
    const adapter = this.registry.get(provider);
    const record = await this.connections.findForWebhook(provider, connectionId);
    if (!adapter || !record || !record.active)
      throw new NotFoundException({ code: 'CONNECTION_NOT_FOUND' });
    if (!canVerifyWebhooks(adapter) || !adapter.verifyWebhook(req, record.connection)) {
      throw new UnauthorizedException({ code: 'WEBHOOK_SIGNATURE_INVALID' });
    }

    const parse = 'parseWebhook' in adapter ? adapter.parseWebhook : undefined;
    const events = parse ? parse.call(adapter, req) : [];
    const ctx = {
      organizationId: record.organizationId,
      locationIds: [record.connection.locationId],
    };
    let stored = 0;
    for (const event of events) {
      const isNew = await this.inbox.storeRaw(
        ctx,
        record.connection.id,
        record.connection.locationId,
        event.idempotencyKey,
        JSON.parse(JSON.stringify(event)),
      );
      if (isNew) stored++;
    }
    return { stored, duplicates: events.length - stored };
  }
}
