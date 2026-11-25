import type { AdminFloor, StaffMember } from '@plateguard/contracts';
import { DEMO_FLOORS, DEMO_TABLES } from '../demo';
import { ApiError, type AdminClient } from './client';
import { placed } from './layout';

type Setup = Pick<
  AdminClient,
  | 'floors'
  | 'saveFloor'
  | 'orderFloors'
  | 'saveTable'
  | 'layoutFloor'
  | 'staff'
  | 'createStaff'
  | 'updateStaff'
  | 'setStaffPin'
  | 'removeStaff'
>;

/** The floor plan and staff editors in memory, for tests. Same rules as the API. */
export function createMemorySetup(me: string): Setup {
  let floors: AdminFloor[] = DEMO_FLOORS.map((name) => ({
    id: `f-${name}`,
    name,
    hidden: false,
    tables: DEMO_TABLES.filter((t) => t.floor === name).map((t) => ({
      id: `t-${t.label}`,
      floorId: `f-${name}`,
      label: t.label,
      seats: t.seats,
      shape: t.seats === 2 ? 'ROUND' : 'SQUARE',
      externalRef: null,
      active: true,
      inUse: false,
      position: null,
      size: null,
      rotation: 0,
    })),
  }));
  let staff: StaffMember[] = [
    { id: me, name: 'Demo Waiter', roles: [], orgRoles: ['OWNER'], hasPin: true, locked: false },
    { id: 'u-sam', name: 'Sam', roles: ['WAITER'], orgRoles: [], hasPin: true, locked: true },
  ];
  let nextId = 1;
  const copy = () => structuredClone(floors);
  const people = () => structuredClone(staff).sort((a, b) => a.name.localeCompare(b.name));
  const find = (id: string) => {
    const m = staff.find((s) => s.id === id);
    if (!m) throw new ApiError(404, 'STAFF_NOT_FOUND');
    if (id === me) throw new ApiError(403, 'STAFF_SELF');
    return m;
  };

  return {
    floors: async () => copy(),
    layoutFloor: async (_, floorId, body) => {
      const floor = floors.find((f) => f.id === floorId);
      for (const p of body.tables) {
        const tb = floor?.tables.find((x) => x.id === p.id);
        if (!tb) throw new ApiError(400, 'TABLE_NOT_ON_FLOOR');
        Object.assign(tb, placed(tb, p));
      }
      return copy();
    },
    saveFloor: async (_, id, body) => {
      if (id)
        floors = floors.map((f) => (f.id === id ? { ...f, ...body, hidden: !!body.hidden } : f));
      else
        floors.push({
          id: `f-new-${nextId++}`,
          name: body.name,
          hidden: !!body.hidden,
          tables: [],
        });
      return copy();
    },
    orderFloors: async (_, ids) => {
      floors = ids.map((id) => floors.find((f) => f.id === id)!);
      return copy();
    },
    saveTable: async (_, id, body) => {
      const all = floors.flatMap((f) => f.tables);
      if (
        (body.active ?? true) &&
        all.some((t) => t.active && t.label === body.label && t.id !== id)
      )
        throw new ApiError(400, 'TABLE_LABEL_TAKEN');
      const before = all.find((t) => t.id === id);
      const table = {
        id: id ?? `t-new-${nextId++}`,
        floorId: body.floorId,
        label: body.label,
        seats: body.seats,
        shape: body.shape ?? 'SQUARE',
        externalRef: body.externalRef ?? null,
        active: body.active ?? true,
        inUse: before?.inUse ?? false,
        position: before?.position ?? null,
        size: before?.size ?? null,
        rotation: before?.rotation ?? 0,
      };
      floors = floors.map((f) => ({
        ...f,
        tables: [
          ...f.tables.filter((t) => t.id !== table.id),
          ...(f.id === table.floorId ? [table] : []),
        ].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
      }));
      return copy();
    },
    staff: async () => people(),
    createStaff: async (_, body) => {
      staff.push({
        id: `u-new-${nextId++}`,
        name: body.name,
        roles: body.roles,
        orgRoles: [],
        hasPin: !!body.pin,
        locked: false,
      });
      return people();
    },
    updateStaff: async (_, id, body) => {
      Object.assign(find(id), { name: body.name, roles: body.roles });
      return people();
    },
    setStaffPin: async (_, id) => {
      Object.assign(
        staff.find((s) => s.id === id)!,
        { hasPin: true, locked: false },
      );
      return people();
    },
    removeStaff: async (_, id) => {
      find(id);
      staff = staff.filter((s) => s.id !== id);
      return people();
    },
  };
}
