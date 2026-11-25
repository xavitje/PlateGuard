import { describe, expect, it } from 'vitest';
import { FakePosAdapter } from '../src/integrations/adapters/fake/fake-pos.adapter.js';
import type { ConnectionsRepository } from '../src/integrations/core/connections.repository.js';
import type { InboxRepository } from '../src/integrations/core/inbox.repository.js';
import type { Connection } from '../src/integrations/core/ports.js';
import { AdapterRegistry } from '../src/integrations/core/registry.js';
import { InboxDispatcher } from '../src/integrations/core/inbox-dispatcher.js';
import { HooksService } from '../src/integrations/hooks.service.js';

const conn = (provider: string, id = 'c1'): Connection => ({
  id,
  locationId: '00000000-0000-4000-8000-000000000010',
  provider,
  config: {},
  secrets: { webhookToken: 'tok' },
});

describe('AdapterRegistry', () => {
  it('finds a connection by capability, not by brand', async () => {
    const registry = new AdapterRegistry()
      .register(new FakePosAdapter([], [], ['menu.read']))
      .register(
        Object.assign(new FakePosAdapter([], [], ['print.ticket']), { provider: 'fake-printer' }),
      );
    const found = await registry.findCapable(
      [conn('fake-pos'), conn('fake-printer', 'c2')],
      'print.ticket',
    );
    expect(found?.connection.id).toBe('c2');
    expect(await registry.findCapable([conn('fake-pos')], 'kds.ticket')).toBeNull();
  });

  it('refuses the same provider twice', () => {
    const registry = new AdapterRegistry().register(new FakePosAdapter());
    expect(() => registry.register(new FakePosAdapter())).toThrow(/already registered/);
  });
});

describe('HooksService', () => {
  const order = { externalOrderId: 'o1', openedAt: '2026-11-25T18:00:00.000Z', lines: [] };

  function setup() {
    const stored = new Set<string>();
    const connections = {
      findForWebhook: async (provider: string, id: string) =>
        provider === 'fake-pos' && id === 'c1'
          ? {
              organizationId: '00000000-0000-4000-8000-000000000001',
              active: true,
              connection: conn('fake-pos'),
            }
          : null,
    } as unknown as ConnectionsRepository;
    const inbox = {
      storeRaw: async (_ctx: unknown, _c: string, _l: string, key: string) => {
        if (stored.has(key)) return false;
        stored.add(key);
        return true;
      },
    } as unknown as InboxRepository;
    const handled: string[] = [];
    const dispatcher = new InboxDispatcher();
    dispatcher.handle(async (id) => {
      handled.push(id);
    });
    const service = new HooksService(
      new AdapterRegistry().register(new FakePosAdapter()),
      connections,
      inbox,
      dispatcher,
    );
    return { service, handled };
  }

  const req = (token: string) => ({
    headers: { 'x-fake-token': token },
    body: Buffer.from(JSON.stringify(order)),
  });

  it('stores a verified message once, hands it on, and ignores the duplicate', async () => {
    const { service, handled } = setup();
    expect(await service.receive('fake-pos', 'c1', req('tok'))).toEqual({
      stored: 1,
      duplicates: 0,
    });
    expect(await service.receive('fake-pos', 'c1', req('tok'))).toEqual({
      stored: 0,
      duplicates: 1,
    });
    expect(handled).toEqual(['c1']);
  });

  it('rejects a bad token and an unknown connection', async () => {
    const { service } = setup();
    await expect(service.receive('fake-pos', 'c1', req('nope'))).rejects.toMatchObject({
      status: 401,
    });
    await expect(service.receive('fake-pos', 'zz', req('tok'))).rejects.toMatchObject({
      status: 404,
    });
    const noHeader = { headers: {}, body: Buffer.from('{}') };
    await expect(service.receive('fake-pos', 'c1', noHeader)).rejects.toMatchObject({
      status: 401,
    });
  });
});
