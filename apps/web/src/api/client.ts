import type {
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

/** Everything the service app reads and writes. One implementation per source. */
export interface ServiceClient {
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
  return {
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
