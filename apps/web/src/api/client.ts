import type {
  AdminFloor,
  FloorDraft,
  StaffDraft,
  StaffMember,
  TableDraft,
  AllergenResponse,
  ComponentDraft,
  ComponentResponse,
  DishDraft,
  DishResponse,
  EquipmentDraft,
  EquipmentResponse,
  IngredientDraft,
  IngredientResponse,
  MenuDraftResponse,
  LoginResponse,
  PinLogin,
  StaffListResponse,
  AlertResponse,
  FloorResponse,
  MeResponse,
  MenuResponse,
  SeatUpdateInput,
  TableResponse,
} from '@plateguard/contracts';

/** The recipe database and the menu, for admin. Saves return the stored row. */
export interface AdminClient {
  allergens(location: string, locale: string): Promise<AllergenResponse[]>;
  ingredients(location: string): Promise<IngredientResponse[]>;
  saveIngredient(
    location: string,
    id: string | null,
    body: IngredientDraft,
  ): Promise<IngredientResponse>;
  equipment(location: string): Promise<EquipmentResponse[]>;
  saveEquipment(
    location: string,
    id: string | null,
    body: EquipmentDraft,
  ): Promise<EquipmentResponse>;
  components(location: string): Promise<ComponentResponse[]>;
  saveComponent(
    location: string,
    id: string | null,
    body: ComponentDraft,
  ): Promise<ComponentResponse>;
  dishes(location: string): Promise<DishResponse[]>;
  saveDish(location: string, id: string | null, body: DishDraft): Promise<DishResponse>;
  menuDraft(location: string): Promise<MenuDraftResponse>;
  setMenuItems(location: string, dishIds: string[]): Promise<MenuDraftResponse>;
  publishMenu(location: string): Promise<MenuDraftResponse>;
  floors(location: string): Promise<AdminFloor[]>;
  saveFloor(location: string, id: string | null, body: FloorDraft): Promise<AdminFloor[]>;
  orderFloors(location: string, floorIds: string[]): Promise<AdminFloor[]>;
  saveTable(location: string, id: string | null, body: TableDraft): Promise<AdminFloor[]>;
  staff(location: string): Promise<StaffMember[]>;
  createStaff(location: string, body: StaffDraft): Promise<StaffMember[]>;
  updateStaff(location: string, id: string, body: Omit<StaffDraft, 'pin'>): Promise<StaffMember[]>;
  setStaffPin(location: string, id: string, pin: string): Promise<StaffMember[]>;
  removeStaff(location: string, id: string): Promise<StaffMember[]>;
}

/** Everything the service app reads and writes. One implementation per source. */
export interface ServiceClient {
  admin: AdminClient;
  staff(slug: string): Promise<StaffListResponse>;
  loginPin(body: PinLogin): Promise<LoginResponse>;
  me(): Promise<MeResponse>;
  floors(location: string): Promise<FloorResponse[]>;
  menu(location: string, locale: string): Promise<MenuResponse>;
  table(location: string, label: string): Promise<TableResponse>;
  alerts(location: string, locale: string): Promise<AlertResponse[]>;
  saveSeat(
    location: string,
    label: string,
    seat: number,
    body: SeatUpdateInput,
  ): Promise<TableResponse>;
  order(location: string, label: string, seat: number, dishId: string): Promise<TableResponse>;
  cancelOrder(location: string, label: string, plateId: string): Promise<TableResponse>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

/**
 * The real API. Sends the shift session token from PIN login; a 401 means the session ended,
 * and onSignedOut sends the device back to the sign-in screen.
 */
export function createHttpClient(
  getToken: () => string | null,
  onSignedOut: () => void,
): ServiceClient {
  const call = async <T>(path: string, init?: { method?: string; body?: unknown }) => {
    const token = getToken();
    const res = await fetch(`/api${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        code?: string;
        details?: Record<string, unknown>;
      };
      if (res.status === 401 && token) onSignedOut();
      throw new ApiError(res.status, err.code ?? 'HTTP_ERROR', err.details);
    }
    return (await res.json()) as T;
  };
  const loc = (l: string) => `/locations/${encodeURIComponent(l)}`;
  const tbl = (l: string, label: string) => `${loc(l)}/tables/${encodeURIComponent(label)}`;
  const adm = (l: string, path: string) => `${loc(l)}/admin/${path}`;
  const save = <T>(l: string, kind: string, id: string | null, body: unknown) =>
    call<T>(id ? adm(l, `${kind}/${id}`) : adm(l, kind), { method: id ? 'PUT' : 'POST', body });
  return {
    admin: {
      allergens: (l, locale) => call(adm(l, `allergens?locale=${locale}`)),
      ingredients: (l) => call(adm(l, 'ingredients')),
      saveIngredient: (l, id, body) => save(l, 'ingredients', id, body),
      equipment: (l) => call(adm(l, 'equipment')),
      saveEquipment: (l, id, body) => save(l, 'equipment', id, body),
      components: (l) => call(adm(l, 'components')),
      saveComponent: (l, id, body) => save(l, 'components', id, body),
      dishes: (l) => call(adm(l, 'dishes')),
      saveDish: (l, id, body) => save(l, 'dishes', id, body),
      menuDraft: (l) => call(adm(l, 'menu')),
      setMenuItems: (l, dishIds) =>
        call(adm(l, 'menu/items'), { method: 'PUT', body: { dishIds } }),
      publishMenu: (l) => call(adm(l, 'menu/publish'), { method: 'POST' }),
      floors: (l) => call(adm(l, 'floors')),
      saveFloor: (l, id, body) => save(l, 'floors', id, body),
      orderFloors: (l, floorIds) =>
        call(adm(l, 'floors/order'), { method: 'PUT', body: { floorIds } }),
      saveTable: (l, id, body) => save(l, 'tables', id, body),
      staff: (l) => call(adm(l, 'staff')),
      createStaff: (l, body) => call(adm(l, 'staff'), { method: 'POST', body }),
      updateStaff: (l, id, body) => call(adm(l, `staff/${id}`), { method: 'PUT', body }),
      setStaffPin: (l, id, pin) =>
        call(adm(l, `staff/${id}/pin`), { method: 'PUT', body: { pin } }),
      removeStaff: (l, id) => call(adm(l, `staff/${id}`), { method: 'DELETE' }),
    },
    staff: (slug) => call(`/auth/locations/${encodeURIComponent(slug)}/staff`),
    loginPin: (body) => call('/auth/pin', { method: 'POST', body }),
    me: () => call('/me'),
    floors: (l) => call(`${loc(l)}/floors`),
    menu: (l, locale) => call(`${loc(l)}/menu?locale=${locale}`),
    table: (l, label) => call(tbl(l, label)),
    alerts: (l, locale) => call(`${loc(l)}/alerts?locale=${locale}`),
    saveSeat: (l, label, seat, body) =>
      call(`${tbl(l, label)}/seats/${seat}`, { method: 'PUT', body }),
    order: (l, label, seat, dishId) =>
      call(`${tbl(l, label)}/seats/${seat}/orders`, { method: 'POST', body: { dishId } }),
    cancelOrder: (l, label, plateId) =>
      call(`${tbl(l, label)}/orders/${plateId}`, { method: 'DELETE' }),
  };
}
