import type {
  AlertResponse,
  KitchenTicketResponse,
  PlateStatusName,
  SeatResponse,
  TableResponse,
} from '@plateguard/contracts';
import {
  assess,
  kitchenBlock,
  kitchenChecklist,
  orderAlerts,
  ROLE_PERMISSIONS,
  type Role,
  uncheckedItems,
  type ResolvedDish,
} from '@plateguard/domain';
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
import { createMemoryIncidents } from './memory-incidents';
import { createMemoryPos } from './memory-pos';
import { createMemoryPrinters } from './memory-printers';
import { createMemorySetup } from './memory-setup';

const LOCATION = 'demo';
const meFor = (role: Role) => ({
  user: { id: 'demo', name: 'Demo Waiter', locale: 'en' },
  locations: [
    {
      id: LOCATION,
      organizationId: 'demo',
      name: 'Demo',
      slug: 'demo',
      permissions: [...ROLE_PERMISSIONS[role]],
    },
  ],
});

/**
 * The same contract as the API, held in memory on the demo data. Used by the tests, so they
 * run without a server; it applies the same rules (alerts only from orders).
 */
export function createMemoryClient(
  seed: DemoService = DEMO_SERVICE,
  dishes: ResolvedDish[] = DEMO_DISHES,
  /** Whose permissions the signed-in demo user has. The owner can do everything. */
  role: Role = 'OWNER',
): ServiceClient {
  const ME = meFor(role);
  const state: DemoService = structuredClone(seed);
  let nextId = 1;
  let passCheck = false;
  const OPEN: PlateStatusName[] = ['ASSESSED', 'IN_KITCHEN', 'CHECKED', 'PASS_CHECKED'];
  const statusOf = (o: { status?: PlateStatusName }) => o.status ?? 'ASSESSED';

  const seatsOf = (label: string): SeatResponse[] =>
    Object.entries(state[label] ?? {})
      .map(([seat, s]) => ({
        seat: Number(seat),
        allergies: s.allergies,
        noAllergy: s.noAllergy,
        orders: s.orders.map((o) => {
          const dish = dishes.find((d) => d.id === o.dishId)!;
          return {
            ...o,
            status: statusOf(o),
            outcome: assess({ dish, guest: s.allergies }).outcome,
          };
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
  const allSeats = () =>
    Object.keys(state).flatMap((label) => seatsOf(label).map((s) => ({ ...s, table: label })));
  const alerts = (): AlertResponse[] => {
    const seats = allSeats();
    const rejected = seats.flatMap((s) =>
      s.orders.flatMap((o) => {
        const dish = dishes.find((d) => d.id === o.dishId)!;
        if (o.status !== 'REJECTED') return [];
        return [
          {
            id: o.id,
            kind: 'stop' as const,
            table: s.table,
            seat: s.seat,
            dishId: dish.id,
            dishName: dish.name,
            result: assess({ dish, guest: s.allergies }),
            rejected: { reason: o.rejectReason ?? '' },
          },
        ];
      }),
    );
    const open = orderAlerts(
      seats.map((s) => ({ ...s, orders: s.orders.filter((o) => OPEN.includes(o.status)) })),
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
    return [...rejected, ...open];
  };

  const tickets = (): KitchenTicketResponse[] =>
    Object.entries(state).flatMap(([table, seats]) =>
      Object.entries(seats).flatMap(([n, s]) =>
        s.allergies.length === 0
          ? []
          : s.orders.map((o) => {
              const dish = dishes.find((d) => d.id === o.dishId)!;
              const result = assess({ dish, guest: s.allergies });
              const block = kitchenBlock(result);
              return {
                plateId: o.id,
                table,
                seat: Number(n),
                course: 1,
                dishName: dish.name,
                orderedAt: new Date(0).toISOString(),
                status: statusOf(o),
                outcome: result.outcome,
                block,
                allergies: result.perAllergy,
                checklist: block ? [] : kitchenChecklist(result),
                qrToken: o.id,
              };
            }),
      ),
    );
  /** Moves a plate on, like the API: only from the statuses it expects. */
  const move = (
    id: string,
    from: PlateStatusName[],
    to: PlateStatusName,
    extra: { rejectReason?: string } = {},
  ) => {
    for (const seats of Object.values(state))
      for (const s of Object.values(seats))
        for (const o of s.orders)
          if (o.id === id) {
            if (!from.includes(statusOf(o))) throw new ApiError(409, 'PLATE_STATUS_CHANGED');
            o.status = to;
            Object.assign(o, extra);
            return;
          }
    throw new ApiError(404, 'PLATE_NOT_FOUND');
  };
  const ticket = (id: string) => {
    const tk = tickets().find((x) => x.plateId === id);
    if (!tk) throw new ApiError(404, 'PLATE_NOT_FOUND');
    return tk;
  };

  const { printers, admin: printerAdmin } = createMemoryPrinters();
  const incidents = createMemoryIncidents(ME.user.name);

  return {
    admin: {
      ...createMemoryAdmin(dishes),
      ...createMemorySetup(ME.user.id),
      settings: async () => ({ passCheck }),
      saveSettings: async (_, body) => {
        passCheck = body.passCheck;
      },
      ...printerAdmin,
      ...createMemoryPos(dishes),
      ...incidents.admin,
    },
    kitchen: {
      tickets: async () => {
        const all = tickets();
        return {
          queue: all.filter((t) => t.status === 'ASSESSED' || t.status === 'IN_KITCHEN'),
          ready: all.filter((t) => t.status === 'CHECKED' || t.status === 'PASS_CHECKED'),
          passCheck,
          printers: printers.length,
        };
      },
      check: async (_, id, checked) => {
        const tk = ticket(id);
        if (tk.block) throw new ApiError(409, 'PLATE_BLOCKED');
        if (uncheckedItems(tk.checklist, checked).length > 0)
          throw new ApiError(400, 'CHECKLIST_INCOMPLETE');
        move(id, ['ASSESSED', 'IN_KITCHEN'], 'CHECKED');
      },
      reject: async (_, id, reason) => move(id, [...OPEN], 'REJECTED', { rejectReason: reason }),
      passCheck: async (_, id) => move(id, ['CHECKED'], 'PASS_CHECKED'),
      serve: async (_, id) =>
        move(id, passCheck ? ['PASS_CHECKED'] : ['CHECKED', 'PASS_CHECKED'], 'SERVED'),
      reprint: async (_, id) => {
        ticket(id);
        for (const p of printers) p.waiting++;
      },
    },
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
    guestMenu: async (slug, _, avoid) => {
      if (slug !== 'demo') throw new ApiError(404, 'LOCATION_NOT_FOUND');
      const guest = avoid.map((allergen) => ({ allergen, severity: 'ALLERGY' as const }));
      return {
        location: { name: 'Brasserie De Haven' },
        published: true,
        dishes: dishes.map((dish) => {
          const base = { id: dish.id, name: dish.name, course: 1 };
          if (guest.length === 0) return base;
          const r = assess({ dish, guest });
          return {
            ...base,
            outcome: r.outcome,
            changes: r.modifications.map((m) => ({
              action: m.action,
              componentName: m.componentName,
              ...(m.substitute ? { substituteName: m.substitute.name } : {}),
            })),
          };
        }),
      };
    },
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
            position: null,
            size: null,
            rotation: 0,
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
    reportIncident: async (_, label, body) => {
      table(label);
      return incidents.report(label, body);
    },
    cancelOrder: async (_, label, plateId) => {
      const s = Object.values(state[label] ?? {}).find((x) =>
        x.orders.some((o) => o.id === plateId),
      );
      const o = s?.orders.find((x) => x.id === plateId);
      if (!s || !o || !['ASSESSED', 'REJECTED'].includes(statusOf(o)))
        throw new ApiError(404, 'ORDER_NOT_FOUND');
      s.orders = s.orders.filter((x) => x.id !== plateId);
      return table(label);
    },
  };
}
