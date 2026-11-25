/** An in-memory Square API for tests: locations, catalog, orders. Only what the adapter calls. */
import type { SquareOrder } from '../src/integrations/adapters/square/square-order.js';

export function fakeSquare(token = 'sandbox-token-0123456789abcdef', locationId = 'LOC1') {
  const items: { id: string; name: string; variationId: string }[] = [];
  const orders = new Map<string, SquareOrder & { updated_at: string }>();
  const calls: string[] = [];
  let n = 0;
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const http: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.pathname}`);
    if (new Headers(init?.headers).get('authorization') !== `Bearer ${token}`)
      return json(401, { errors: [{ code: 'UNAUTHORIZED', detail: 'bad token' }] });
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const path = url.pathname;
    if (method === 'GET' && path.startsWith('/v2/locations/')) {
      return path.endsWith(`/${locationId}`)
        ? json(200, { location: { id: locationId, name: 'Sandbox Bistro', currency: 'EUR' } })
        : json(404, { errors: [{ code: 'NOT_FOUND', detail: 'no location' }] });
    }
    if (method === 'POST' && path === '/v2/catalog/batch-upsert') {
      const id_mappings: { client_object_id: string; object_id: string }[] = [];
      for (const o of body.batches[0].objects) {
        const id = `ITEM${++n}`;
        const variationId = `VAR${n}`;
        items.push({ id, name: o.item_data.name, variationId });
        id_mappings.push({ client_object_id: o.id, object_id: id });
        id_mappings.push({
          client_object_id: o.item_data.variations[0].id,
          object_id: variationId,
        });
      }
      return json(200, { id_mappings });
    }
    if (method === 'GET' && path === '/v2/catalog/list') {
      return json(200, {
        objects: items.map((i) => ({
          id: i.id,
          type: 'ITEM',
          item_data: {
            name: i.name,
            variations: [{ id: i.variationId, item_variation_data: { name: 'Regular' } }],
          },
        })),
      });
    }
    if (method === 'POST' && path === '/v2/orders') {
      const id = `ORDER${++n}`;
      const order = {
        ...body.order,
        id,
        state: 'OPEN',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        line_items: body.order.line_items.map((l: object, i: number) => ({
          ...l,
          uid: `${id}-L${i}`,
          name: items.find(
            (x) => x.variationId === (l as { catalog_object_id: string }).catalog_object_id,
          )?.name,
        })),
      };
      orders.set(id, order);
      return json(200, { order });
    }
    if (method === 'GET' && path.startsWith('/v2/orders/')) {
      const o = orders.get(decodeURIComponent(path.split('/').pop()!));
      return o ? json(200, { order: o }) : json(404, { errors: [{ code: 'NOT_FOUND' }] });
    }
    if (method === 'POST' && path === '/v2/orders/search') {
      return json(200, { orders: [...orders.values()].filter((o) => o.state === 'OPEN') });
    }
    return json(404, { errors: [{ code: 'NOT_FOUND', detail: path }] });
  };

  /** An order typed straight into the till, as the tests need it. */
  const ring = (order: Omit<SquareOrder, 'id'>) => {
    const id = `ORDER${++n}`;
    orders.set(id, {
      location_id: locationId,
      state: 'OPEN',
      ...order,
      id,
      updated_at: new Date().toISOString(),
    });
    return id;
  };

  return { http, token, locationId, items, orders, calls, ring };
}
