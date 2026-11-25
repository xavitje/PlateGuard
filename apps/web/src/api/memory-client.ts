import type { SeatResponse, TableResponse } from '@plateguard/contracts';
import { assess, orderAlerts, ROLE_PERMISSIONS, type ResolvedDish } from '@plateguard/domain';
import {
  DEMO_DISHES,
  DEMO_FLOORS,
  DEMO_INGREDIENTS,
  DEMO_SERVICE,
  DEMO_TABLES,
  type DemoSeat,
  type DemoService,
} from '../demo';
import { ApiError, type ServiceClient } from './client';
import { createMemoryAdmin } from './memory-admin';
import { createMemorySetup } from './memory-setup';

const LOCATION = 'demo';
const ME = {
  user: { id: 'demo', name: 'Demo Waiter', locale: 'en' },
  locations: [
    {
      id: LOCATION,
      organizationId: 'demo',
      name: 'Demo',
      slug: 'demo',
      permissions: [...ROLE_PERMISSIONS.OWNER],
    },
  ],
};

/**
 * The same contract as the API, held in memory on the demo data. Used by the tests, so they
 * run without a server; it applies the same rules (alerts only from orders).
 */
export function createMemoryClient(
  seed: DemoService = DEMO_SERVICE,
  dishes: ResolvedDish[] = DEMO_DISHES,
): ServiceClient {
  const state: DemoService = structuredClone(seed);
  let nextId = 1;

  const seatsOf = (label: string): SeatResponse[] =>
    Object.entries(state[label] ?? {})
      .map(([seat, s]) => ({
        seat: Number(seat),
        allergies: s.allergies,
        noAllergy: s.noAllergy,
        orders: s.orders.map((o) => {
          const dish = dishes.find((d) => d.id === o.dishId)!;
          return { ...o, outcome: assess({ dish, guest: s.allergies }).outcome };
        }),
      }))
      .sort((a, b) => a.seat - b.seat);

  const table = (label: string): TableResponse => {
    const t = DEMO_TABLES.find((x) => x.label === label);
    if (!t) throw new ApiError(404, 'TABLE_NOT_FOUND');
    return {
      id: label,
      label,
      seats: t.seats,
      visitId: state[label] ? label : null,
      bySeat: seatsOf(label),
    };
  };
  const seat = (label: string, n: number) => {
    state[label] ??= {};
    return (state[label][n] ??= { allergies: [], noAllergy: false, orders: [] });
  };
  const alerts = () =>
    orderAlerts(
      Object.keys(state).flatMap((label) => seatsOf(label).map((s) => ({ ...s, table: label }))),
      dishes,
    ).map((a) => ({
      id: a.id,
      kind: a.kind,
      table: a.table,
      seat: a.seat,
      dishId: a.dish.id,
      dishName: a.dish.name,
      result: a.result,
    }));

  return {
    admin: { ...createMemoryAdmin(dishes), ...createMemorySetup(ME.user.id) },
    staff: async () => ({
      location: { id: LOCATION, name: 'Demo' },
      staff: [{ id: 'demo', name: 'Demo Waiter' }],
    }),
    loginPin: async (body) => {
      if (body.pin !== '1234') throw new ApiError(401, 'PIN_INVALID', { triesLeft: 4 });
      return {
        token: 'memory',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        me: ME,
      };
    },
    me: async () => ME,
    floors: async () => {
      const all = alerts();
      return DEMO_FLOORS.map((f) => ({
        id: f,
        name: f,
        tables: DEMO_TABLES.filter((t) => t.floor === f).map((t) => {
          const seats = seatsOf(t.label);
          return {
            id: t.label,
            label: t.label,
            seats: t.seats,
            shape: t.seats === 2 ? 'ROUND' : 'SQUARE',
            guests: seats.length,
            allergyGuests: seats.filter((s) => s.allergies.length > 0).length,
            openAlerts: all.filter((a) => a.table === t.label).length,
          } as const;
        }),
      }));
    },
    menu: async () => ({ dishes, ingredients: DEMO_INGREDIENTS }),
    table: async (_, label) => table(label),
    alerts: async () => alerts(),
    saveSeat: async (_, label, n, body) => {
      table(label);
      const s = seat(label, n);
      s.allergies = body.allergies as DemoSeat['allergies'];
      s.noAllergy = body.allergies.length === 0 && !!body.noAllergy;
      return table(label);
    },
    order: async (_, label, n, dishId) => {
      table(label);
      seat(label, n).orders.push({ id: `new-${nextId++}`, dishId });
      return table(label);
    },
    cancelOrder: async (_, label, plateId) => {
      for (const s of Object.values(state[label] ?? {}))
        s.orders = s.orders.filter((o) => o.id !== plateId);
      return table(label);
    },
  };
}
