import type {
  PosAllergyButton,
  PosConnection,
  PosEvent,
  PosItem,
  PosSyncResult,
} from '@plateguard/contracts';
import type { ResolvedDish } from '@plateguard/domain';
import { ApiError, type AdminClient } from './client';

type PosAdmin = Pick<
  AdminClient,
  | 'pos'
  | 'connectPos'
  | 'posWebhook'
  | 'disconnectPos'
  | 'posItems'
  | 'mapPosItem'
  | 'pushPosMenu'
  | 'posTestOrder'
  | 'syncPos'
  | 'posEvents'
  | 'posAllergyButtons'
  | 'setPosAllergyButton'
>;

const none = (): PosSyncResult => ({
  orders: 0,
  plates: 0,
  duplicates: 0,
  unmapped: 0,
  noSeat: 0,
  noTable: 0,
  failed: 0,
  withoutAllergy: 0,
});

/** A POS link for the demo and tests. Nothing leaves the browser; orders are not placed. */
export function createMemoryPos(dishes: ResolvedDish[]): PosAdmin {
  let connection: PosConnection | null = null;
  let items: PosItem[] = [];
  const events: PosEvent[] = [];
  const buttons: PosAllergyButton[] = [
    { name: 'Allergie: noten', recognized: ['NUTS'], allergen: null },
    { name: 'Extra kaas', recognized: [], allergen: null },
  ];
  let next = 1;
  const status = async () => ({ connection: structuredClone(connection), secretsReady: true });
  const need = () => {
    if (!connection) throw new ApiError(404, 'POS_NOT_CONNECTED');
    return connection;
  };
  const list = async () => ({ items: structuredClone(items) });
  return {
    pos: status,
    connectPos: async (_, body) => {
      connection = {
        id: 'demo-pos',
        provider: body.provider,
        status: 'ACTIVE',
        locationName: body.provider === 'square' ? 'Sandbox' : '',
        externalLocationId:
          body.provider === 'square'
            ? body.squareLocationId
            : body.provider === 'lightspeed-k'
              ? body.businessLocationId
              : '',
        sandbox: body.provider === 'square',
        webhooks: body.provider !== 'lightspeed-k',
        webhookPath: `/hooks/${body.provider}/demo-pos`,
        webhookUrl: null,
        lastEventAt: null,
      };
      return status();
    },
    posWebhook: async (_, body) => {
      need().webhookUrl = body.url;
      return status();
    },
    disconnectPos: async () => {
      connection = null;
      items = [];
      return status();
    },
    posItems: async () => {
      need();
      return list();
    },
    mapPosItem: async (_, body) => {
      need();
      items = items.map((i) =>
        i.externalId === body.externalItemId ? { ...i, dishId: body.dishId } : i,
      );
      return list();
    },
    pushPosMenu: async () => {
      need();
      const linked = new Set(items.map((i) => i.dishId));
      items = [
        ...items,
        ...dishes
          .filter((d) => !linked.has(d.id))
          .map((d) => ({ externalId: `sq-${d.id}`, name: d.name, dishId: d.id })),
      ];
      return list();
    },
    posTestOrder: async (_, body) => {
      need();
      const result = { ...none(), orders: 1, plates: body.lines.length };
      events.unshift({
        id: `event-${next}`,
        receivedAt: new Date().toISOString(),
        status: 'DONE',
        source: 'TEST',
        orderId: `order-${next++}`,
        result,
        order: {
          table: body.table,
          skipped: null,
          lines: body.lines.map((l) => ({
            name: dishes.find((d) => d.id === l.dishId)?.name ?? l.dishId,
            seat: l.seat,
            quantity: 1,
            outcome: 'PLACED' as const,
            ...(l.note ? { fromPos: [l.note] } : {}),
          })),
        },
        rejected: null,
        error: null,
      });
      return result;
    },
    syncPos: async () => {
      need();
      return none();
    },
    posEvents: async () => ({ events: structuredClone(events) }),
    posAllergyButtons: async () => {
      need();
      return { buttons: structuredClone(buttons) };
    },
    setPosAllergyButton: async (_, body) => {
      need();
      const b = buttons.find((x) => x.name === body.name);
      if (b) b.allergen = body.allergen;
      return { buttons: structuredClone(buttons) };
    },
  };
}
