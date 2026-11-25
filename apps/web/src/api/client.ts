import type {
  GuestMenuResponse,
  KitchenResponse,
  LocationSettings,
  AdminFloor,
  FloorDraft,
  FloorLayout,
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
  MenuImportInput,
  MenuImportProposal,
  LoginResponse,
  PinLogin,
  SignInLocationResponse,
  AlertResponse,
  FloorResponse,
  MeResponse,
  MenuResponse,
  IncidentDetail,
  IncidentFollowUp,
  IncidentReport,
  IncidentsResponse,
  DashboardResponse,
  PosConnectInput,
  PosEventsResponse,
  PosItemsResponse,
  PosMappingInput,
  PosResponse,
  PosSyncResult,
  PosTestOrderInput,
  PosWebhookInput,
  PrinterAddress,
  PrinterInput,
  PrintersResponse,
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
  /** Reads dishes from photos or a PDF of a menu. Saves nothing. */
  importMenu(location: string, body: MenuImportInput): Promise<MenuImportProposal>;
  /** The printable allergen card of a published menu version, as a PDF. */
  allergenCard(location: string, versionId: string, locale: string): Promise<Blob>;
  floors(location: string): Promise<AdminFloor[]>;
  saveFloor(location: string, id: string | null, body: FloorDraft): Promise<AdminFloor[]>;
  orderFloors(location: string, floorIds: string[]): Promise<AdminFloor[]>;
  layoutFloor(location: string, floorId: string, body: FloorLayout): Promise<AdminFloor[]>;
  saveTable(location: string, id: string | null, body: TableDraft): Promise<AdminFloor[]>;
  staff(location: string): Promise<StaffMember[]>;
  createStaff(location: string, body: StaffDraft): Promise<StaffMember[]>;
  updateStaff(location: string, id: string, body: Omit<StaffDraft, 'pin'>): Promise<StaffMember[]>;
  setStaffPin(location: string, id: string, pin: string): Promise<StaffMember[]>;
  removeStaff(location: string, id: string): Promise<StaffMember[]>;
  settings(location: string): Promise<LocationSettings>;
  saveSettings(location: string, body: LocationSettings): Promise<void>;
  /** Kitchen printers that fetch allergy tickets themselves (Star CloudPRNT). */
  printers(location: string): Promise<PrintersResponse>;
  /** Answers with the address to enter in the printer: shown once. */
  addPrinter(location: string, body: PrinterInput): Promise<PrinterAddress>;
  newPrinterKey(location: string, id: string): Promise<PrinterAddress>;
  testPrinter(location: string, id: string): Promise<void>;
  removePrinter(location: string, id: string): Promise<PrintersResponse>;
  /** The POS link (for now a Square test account). */
  pos(location: string): Promise<PosResponse>;
  connectPos(location: string, body: PosConnectInput): Promise<PosResponse>;
  posWebhook(location: string, body: PosWebhookInput): Promise<PosResponse>;
  disconnectPos(location: string): Promise<PosResponse>;
  /** The POS's items, read from the POS, with the dish each is linked to. */
  posItems(location: string): Promise<PosItemsResponse>;
  mapPosItem(location: string, body: PosMappingInput): Promise<PosItemsResponse>;
  /** Puts every published dish not yet linked into the test POS. */
  pushPosMenu(location: string): Promise<PosItemsResponse>;
  posTestOrder(location: string, body: PosTestOrderInput): Promise<PosSyncResult>;
  syncPos(location: string): Promise<PosSyncResult>;
  posEvents(location: string): Promise<PosEventsResponse>;
  /** The management figures over the last days, per location the user may see. */
  dashboard(location: string, days: number): Promise<DashboardResponse>;
  incidents(location: string): Promise<IncidentsResponse>;
  incident(location: string, id: string): Promise<IncidentDetail>;
  followUpIncident(location: string, id: string, body: IncidentFollowUp): Promise<IncidentDetail>;
  incidentPdf(location: string, id: string, locale: string): Promise<Blob>;
}

/** The kitchen display and the pass. Writes answer nothing: the screen reloads its tickets. */
export interface KitchenClient {
  tickets(location: string, locale: string): Promise<KitchenResponse>;
  check(location: string, plateId: string, checked: string[], locale: string): Promise<void>;
  reject(location: string, plateId: string, reason: string): Promise<void>;
  /** Approves a blocked plate, with the guest's consent and a reason. */
  override(location: string, plateId: string, reason: string, locale: string): Promise<void>;
  passCheck(location: string, plateId: string): Promise<void>;
  serve(location: string, plateId: string): Promise<void>;
  /** The plate's allergy ticket again, on every kitchen printer. */
  reprint(location: string, plateId: string): Promise<void>;
}

/** Everything the service app reads and writes. One implementation per source. */
export interface ServiceClient {
  admin: AdminClient;
  kitchen: KitchenClient;
  signInLocation(slug: string): Promise<SignInLocationResponse>;
  loginPin(body: PinLogin): Promise<LoginResponse>;
  me(): Promise<MeResponse>;
  /** Public: the published allergen menu of a location, judged for what the guest avoids. */
  guestMenu(slug: string, locale: string, avoid: string[]): Promise<GuestMenuResponse>;
  floors(location: string): Promise<FloorResponse[]>;
  menu(location: string, locale: string): Promise<MenuResponse>;
  table(location: string, label: string): Promise<TableResponse>;
  alerts(location: string, locale: string): Promise<AlertResponse[]>;
  /** Marks these alerts read for the signed-in person, or every open one without ids. */
  markAlertsRead(location: string, locale: string, ids?: string[]): Promise<AlertResponse[]>;
  saveSeat(
    location: string,
    label: string,
    seat: number,
    body: SeatUpdateInput,
  ): Promise<TableResponse>;
  order(
    location: string,
    label: string,
    seat: number,
    dishId: string,
    /** Required for a dish that is "do not serve" for this guest. */
    note?: string,
  ): Promise<TableResponse>;
  cancelOrder(location: string, label: string, plateId: string): Promise<TableResponse>;
  /** An incident at a table; the server freezes what is known about the seat and plate. */
  reportIncident(location: string, label: string, body: IncidentReport): Promise<{ id: string }>;
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
  const call = async <T>(
    path: string,
    init?: { method?: string; body?: unknown; blob?: boolean },
  ) => {
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
    if (res.status === 204) return undefined as T;
    if (init?.blob) return (await res.blob()) as T;
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
      importMenu: (l, body) => call(adm(l, 'menu/import'), { method: 'POST', body }),
      allergenCard: (l, id, locale) =>
        call(adm(l, `menu/versions/${id}/card.pdf?locale=${locale}`), { blob: true }),
      floors: (l) => call(adm(l, 'floors')),
      saveFloor: (l, id, body) => save(l, 'floors', id, body),
      orderFloors: (l, floorIds) =>
        call(adm(l, 'floors/order'), { method: 'PUT', body: { floorIds } }),
      layoutFloor: (l, id, body) => call(adm(l, `floors/${id}/layout`), { method: 'PUT', body }),
      saveTable: (l, id, body) => save(l, 'tables', id, body),
      staff: (l) => call(adm(l, 'staff')),
      createStaff: (l, body) => call(adm(l, 'staff'), { method: 'POST', body }),
      updateStaff: (l, id, body) => call(adm(l, `staff/${id}`), { method: 'PUT', body }),
      setStaffPin: (l, id, pin) =>
        call(adm(l, `staff/${id}/pin`), { method: 'PUT', body: { pin } }),
      removeStaff: (l, id) => call(adm(l, `staff/${id}`), { method: 'DELETE' }),
      settings: (l) => call(adm(l, 'settings')),
      saveSettings: (l, body) => call(adm(l, 'settings'), { method: 'PUT', body }),
      printers: (l) => call(adm(l, 'printers')),
      addPrinter: (l, body) => call(adm(l, 'printers'), { method: 'POST', body }),
      newPrinterKey: (l, id) => call(adm(l, `printers/${id}/key`), { method: 'POST' }),
      testPrinter: (l, id) => call(adm(l, `printers/${id}/test`), { method: 'POST' }),
      removePrinter: (l, id) => call(adm(l, `printers/${id}`), { method: 'DELETE' }),
      pos: (l) => call(adm(l, 'pos')),
      connectPos: (l, body) => call(adm(l, 'pos'), { method: 'POST', body }),
      posWebhook: (l, body) => call(adm(l, 'pos/webhook'), { method: 'PUT', body }),
      disconnectPos: (l) => call(adm(l, 'pos'), { method: 'DELETE' }),
      posItems: (l) => call(adm(l, 'pos/items')),
      mapPosItem: (l, body) => call(adm(l, 'pos/items'), { method: 'PUT', body }),
      pushPosMenu: (l) => call(adm(l, 'pos/items/push'), { method: 'POST' }),
      posTestOrder: (l, body) => call(adm(l, 'pos/test-order'), { method: 'POST', body }),
      syncPos: (l) => call(adm(l, 'pos/sync'), { method: 'POST' }),
      posEvents: (l) => call(adm(l, 'pos/events')),
      dashboard: (l, days) => call(`${loc(l)}/dashboard?days=${days}`),
      incidents: (l) => call(`${loc(l)}/incidents`),
      incident: (l, id) => call(`${loc(l)}/incidents/${id}`),
      followUpIncident: (l, id, body) => call(`${loc(l)}/incidents/${id}`, { method: 'PUT', body }),
      incidentPdf: (l, id, locale) =>
        call(`${loc(l)}/incidents/${id}/report.pdf?locale=${locale}`, { blob: true }),
    },
    kitchen: {
      tickets: (l, locale) => call(`${loc(l)}/kitchen?locale=${locale}`),
      check: (l, id, checked, locale) =>
        call(`${loc(l)}/plates/${id}/check?locale=${locale}`, {
          method: 'POST',
          body: { checked },
        }),
      reject: (l, id, reason) =>
        call(`${loc(l)}/plates/${id}/reject`, { method: 'POST', body: { reason } }),
      override: (l, id, reason, locale) =>
        call(`${loc(l)}/plates/${id}/override?locale=${locale}`, {
          method: 'POST',
          body: { reason, guestConsent: true },
        }),
      passCheck: (l, id) => call(`${loc(l)}/plates/${id}/pass-check`, { method: 'POST' }),
      serve: (l, id) => call(`${loc(l)}/plates/${id}/serve`, { method: 'POST' }),
      reprint: (l, id) => call(`${loc(l)}/plates/${id}/print`, { method: 'POST' }),
    },
    signInLocation: (slug) => call(`/auth/locations/${encodeURIComponent(slug)}`),
    loginPin: (body) => call('/auth/pin', { method: 'POST', body }),
    me: () => call('/me'),
    guestMenu: (slug, locale, avoid) =>
      call(
        `/public/locations/${encodeURIComponent(slug)}/menu?locale=${locale}&avoid=${avoid.join(',')}`,
      ),
    floors: (l) => call(`${loc(l)}/floors`),
    menu: (l, locale) => call(`${loc(l)}/menu?locale=${locale}`),
    table: (l, label) => call(tbl(l, label)),
    alerts: (l, locale) => call(`${loc(l)}/alerts?locale=${locale}`),
    markAlertsRead: (l, locale, ids) =>
      call(`${loc(l)}/alerts/read?locale=${locale}`, {
        method: 'POST',
        body: ids ? { ids } : {},
      }),
    saveSeat: (l, label, seat, body) =>
      call(`${tbl(l, label)}/seats/${seat}`, { method: 'PUT', body }),
    order: (l, label, seat, dishId, note) =>
      call(`${tbl(l, label)}/seats/${seat}/orders`, {
        method: 'POST',
        body: note ? { dishId, note } : { dishId },
      }),
    cancelOrder: (l, label, plateId) =>
      call(`${tbl(l, label)}/orders/${plateId}`, { method: 'DELETE' }),
    reportIncident: (l, label, body) =>
      call(`${tbl(l, label)}/incidents`, { method: 'POST', body }),
  };
}
