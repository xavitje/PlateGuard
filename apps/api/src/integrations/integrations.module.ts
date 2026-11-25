import { Module } from '@nestjs/common';
import { CloudPrntAdapter } from './adapters/cloudprnt/cloudprnt.adapter.js';
import { FakePosAdapter } from './adapters/fake/fake-pos.adapter.js';
import { SquarePosAdapter } from './adapters/square/square-pos.adapter.js';
import { ConnectionsRepository } from './core/connections.repository.js';
import { InboxDispatcher } from './core/inbox-dispatcher.js';
import { InboxRepository } from './core/inbox.repository.js';
import { OutboxRepository } from './core/outbox.repository.js';
import { AdapterRegistry } from './core/registry.js';
import { HooksController } from './hooks.controller.js';
import { HooksService } from './hooks.service.js';

/** The only module that knows POS, KDS and printer brands. */
@Module({
  controllers: [HooksController],
  providers: [
    {
      provide: AdapterRegistry,
      useFactory: () => {
        const registry = new AdapterRegistry()
          .register(new CloudPrntAdapter())
          .register(new SquarePosAdapter());
        if (process.env.NODE_ENV !== 'production') registry.register(new FakePosAdapter());
        return registry;
      },
    },
    ConnectionsRepository,
    InboxRepository,
    OutboxRepository,
    InboxDispatcher,
    HooksService,
  ],
  exports: [
    AdapterRegistry,
    OutboxRepository,
    ConnectionsRepository,
    InboxRepository,
    InboxDispatcher,
  ],
})
export class IntegrationsModule {}
