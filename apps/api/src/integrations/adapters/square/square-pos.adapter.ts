/**
 * Square, for now only against the Square Developer sandbox: a free test account in which
 * PlateGuard can also fill the catalog and ring up orders, so the whole path can be tried
 * without a till. Orders come in by webhook (order.created, order.updated) and by pulling.
 *
 * Config: squareLocationId, environment, currency, locationName, webhookUrl.
 * Secrets (encrypted): accessToken, signatureKey.
 */
import { randomUUID } from 'node:crypto';
import type { CanonicalMenuItem, CanonicalOrder } from '@plateguard/contracts';
import type {
  Capability,
  Connection,
  ConnectResult,
  HealthStatus,
  InboundEvent,
  RawRequest,
  SandboxPos,
} from '../../core/ports.js';
import {
  PRODUCTION_URL,
  SANDBOX_URL,
  SquareApi,
  SquareApiError,
  type Fetch,
} from './square-api.js';
import { toCanonicalOrder, type SquareOrder } from './square-order.js';
import {
  orderIdOf,
  SIGNATURE_HEADER,
  verifySquareSignature,
  type SquareEvent,
} from './square-webhook.js';

interface SquareLocation {
  id: string;
  name?: string;
  currency?: string;
  status?: string;
}

interface CatalogObject {
  id: string;
  type: string;
  is_deleted?: boolean;
  modifier_list_data?: { modifiers?: { modifier_data?: { name?: string } }[] };
  item_data?: {
    name?: string;
    variations?: { id: string; item_variation_data?: { name?: string } }[];
  };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const MAX_PAGES = 10;

export class SquarePosAdapter implements SandboxPos {
  readonly provider = 'square';
  readonly version = '0.1.0';
  readonly kinds = ['POS'] as const;

  constructor(private readonly http: Fetch = (...a) => fetch(...a)) {}

  private api(conn: Connection): SquareApi {
    // SQUARE_SANDBOX_URL points the sandbox at a local stand-in, for development without Square.
    const base =
      conn.config.environment === 'production'
        ? PRODUCTION_URL
        : (process.env.SQUARE_SANDBOX_URL ?? SANDBOX_URL);
    return new SquareApi(conn.secrets.accessToken ?? '', base, this.http);
  }

  private location(conn: Connection): string {
    return str(conn.config.squareLocationId);
  }

  capabilities(): Promise<Capability[]> {
    return Promise.resolve(['menu.read', 'order.read', 'order.webhook', 'order.seat']);
  }

  /** Checks the token against the location, and keeps the location's name and currency. */
  async connect(conn: Connection): Promise<ConnectResult> {
    try {
      const { location } = await this.api(conn).call<{ location: SquareLocation }>(
        'GET',
        `/v2/locations/${encodeURIComponent(this.location(conn))}`,
      );
      return {
        ok: true,
        info: { locationName: location.name ?? '', currency: location.currency ?? 'USD' },
      };
    } catch (e) {
      if (e instanceof SquareApiError)
        return {
          ok: false,
          error:
            e.status === 401 ? 'TOKEN_INVALID' : e.status === 404 ? 'LOCATION_NOT_FOUND' : e.code,
        };
      return { ok: false, error: 'UNREACHABLE' };
    }
  }

  async health(conn: Connection): Promise<HealthStatus> {
    const r = await this.connect(conn);
    return r.ok ? { ok: true } : { ok: false, detail: r.error ?? 'ERROR' };
  }

  /** Every variation is an item to map: order lines name the variation, not the item. */
  async listMenuItems(conn: Connection): Promise<CanonicalMenuItem[]> {
    const items: CanonicalMenuItem[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams({ types: 'ITEM', ...(cursor ? { cursor } : {}) });
      const res = await this.api(conn).call<{ objects?: CatalogObject[]; cursor?: string }>(
        'GET',
        `/v2/catalog/list?${q}`,
      );
      for (const o of res.objects ?? []) {
        if (o.is_deleted) continue;
        const variations = o.item_data?.variations ?? [];
        for (const v of variations) {
          const vName = v.item_variation_data?.name;
          items.push({
            externalId: v.id,
            name:
              variations.length > 1 && vName
                ? `${o.item_data?.name ?? ''} · ${vName}`
                : (o.item_data?.name ?? v.id),
          });
        }
      }
      cursor = res.cursor;
      if (!cursor) break;
    }
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  async listModifiers(conn: Connection): Promise<string[]> {
    const names = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams({ types: 'MODIFIER_LIST', ...(cursor ? { cursor } : {}) });
      const res = await this.api(conn).call<{ objects?: CatalogObject[]; cursor?: string }>(
        'GET',
        `/v2/catalog/list?${q}`,
      );
      for (const o of res.objects ?? [])
        if (!o.is_deleted)
          for (const m of o.modifier_list_data?.modifiers ?? [])
            if (m.modifier_data?.name) names.add(m.modifier_data.name);
      cursor = res.cursor;
      if (!cursor) break;
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  async pullOrders(conn: Connection, since: Date): Promise<CanonicalOrder[]> {
    const orders: CanonicalOrder[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await this.api(conn).call<{ orders?: SquareOrder[]; cursor?: string }>(
        'POST',
        '/v2/orders/search',
        {
          location_ids: [this.location(conn)],
          limit: 100,
          ...(cursor ? { cursor } : {}),
          query: {
            filter: {
              state_filter: { states: ['OPEN'] },
              date_time_filter: { updated_at: { start_at: since.toISOString() } },
            },
            sort: { sort_field: 'UPDATED_AT', sort_order: 'ASC' },
          },
        },
      );
      orders.push(...(res.orders ?? []).map(toCanonicalOrder));
      cursor = res.cursor;
      if (!cursor) break;
    }
    return orders;
  }

  async getOrder(conn: Connection, externalOrderId: string): Promise<CanonicalOrder | null> {
    try {
      const { order } = await this.api(conn).call<{ order: SquareOrder }>(
        'GET',
        `/v2/orders/${encodeURIComponent(externalOrderId)}`,
      );
      // An order of another Square location is not ours to read.
      return order.location_id && order.location_id !== this.location(conn)
        ? null
        : toCanonicalOrder(order);
    } catch (e) {
      if (e instanceof SquareApiError && e.status === 404) return null;
      throw e;
    }
  }

  verifyWebhook(req: RawRequest, conn: Connection): boolean {
    return verifySquareSignature(
      conn.secrets.signatureKey ?? '',
      str(conn.config.webhookUrl),
      req.body,
      req.headers[SIGNATURE_HEADER],
    );
  }

  /** Square sends only the order's id: the order itself is fetched when the event is handled. */
  parseWebhook(req: RawRequest): InboundEvent[] {
    let event: SquareEvent;
    try {
      event = JSON.parse(req.body.toString('utf8')) as SquareEvent;
    } catch {
      return [];
    }
    const orderId = orderIdOf(event);
    if (!orderId || !event.event_id) return [];
    return [{ idempotencyKey: event.event_id, type: 'order.updated', externalOrderId: orderId }];
  }

  async pushMenu(
    conn: Connection,
    items: { key: string; name: string }[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (items.length === 0) return out;
    const currency = str(conn.config.currency) || 'USD';
    const res = await this.api(conn).call<{
      id_mappings?: { client_object_id: string; object_id: string }[];
    }>('POST', '/v2/catalog/batch-upsert', {
      idempotency_key: randomUUID(),
      batches: [
        {
          objects: items.map((item, i) => ({
            type: 'ITEM',
            id: `#item-${i}`,
            item_data: {
              name: item.name.slice(0, 255),
              variations: [
                {
                  type: 'ITEM_VARIATION',
                  id: `#var-${i}`,
                  item_variation_data: {
                    item_id: `#item-${i}`,
                    name: 'Regular',
                    pricing_type: 'FIXED_PRICING',
                    price_money: { amount: 100, currency },
                  },
                },
              ],
            },
          })),
        },
      ],
    });
    const ids = new Map((res.id_mappings ?? []).map((m) => [m.client_object_id, m.object_id]));
    items.forEach((item, i) => {
      const id = ids.get(`#var-${i}`);
      if (id) out.set(item.key, id);
    });
    return out;
  }

  async placeOrder(
    conn: Connection,
    order: { table: string; lines: { externalItemId: string; seat: number; note?: string }[] },
  ): Promise<string> {
    const res = await this.api(conn).call<{ order: SquareOrder }>('POST', '/v2/orders', {
      idempotency_key: randomUUID(),
      order: {
        location_id: this.location(conn),
        reference_id: `Tafel ${order.table}`.slice(0, 40),
        metadata: { table: order.table },
        line_items: order.lines.map((l) => ({
          catalog_object_id: l.externalItemId,
          quantity: '1',
          note: [`Stoel ${l.seat}`, l.note].filter(Boolean).join(' · ').slice(0, 500),
          metadata: { seat: String(l.seat) },
        })),
      },
    });
    return res.order.id;
  }
}
