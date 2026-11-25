import type {
  AlertResponse,
  FloorResponse,
  MeResponse,
  MenuResponse,
  SeatUpdateInput,
  TableResponse,
} from '@plateguard/contracts';

/** Everything the service app reads and writes. One implementation per source. */
export interface ServiceClient {
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
  ) {
    super(code);
  }
}

/**
 * The real API. Until PIN login lands, the user is the development user from VITE_DEV_USER
 * (the seeded demo waiter by default), sent in a header the API accepts only with AUTH_MODE=dev.
 */
export function createHttpClient(
  devUser = import.meta.env.VITE_DEV_USER ?? '00000000-0000-4000-8000-000000000101',
): ServiceClient {
  const call = async <T>(path: string, init?: { method?: string; body?: unknown }) => {
    const res = await fetch(`/api${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        'x-plateguard-user': devUser,
        ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { code?: string };
      throw new ApiError(res.status, err.code ?? 'HTTP_ERROR');
    }
    return (await res.json()) as T;
  };
  const loc = (l: string) => `/locations/${encodeURIComponent(l)}`;
  const tbl = (l: string, label: string) => `${loc(l)}/tables/${encodeURIComponent(label)}`;
  return {
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
