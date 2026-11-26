/**
 * Lightspeed Restaurant K-Series. K-Series sends no message when staff ring up an order on the
 * iPad, so orders are pulled: the open checks of the business location (Order and Pay API,
 * scope orders-api). The kitchen tickets are printed by Lightspeed itself, as always; PlateGuard
 * prints its allergy ticket next to them.
 *
 * Config: businessLocationId, environment ('demo' | 'production').
 * Secrets (encrypted): accessToken.
 * shortcut: the OAuth sign-in and token refresh need the partner app's client id and secret;
 * until Lightspeed hands them out, the access token is pasted in, like Square's.
 */
import type { CanonicalMenuItem, CanonicalOrder } from '@plateguard/contracts';
import type {
  Capability,
  Connection,
  ConnectResult,
  HealthStatus,
  PosAdapter,
} from '../../core/ports.js';
import { accountId, toCanonicalOrder, type LsAccount } from './lightspeed-order.js';

export const DEMO_URL = 'https://api.trial.lsk.lightspeed.app';
export const PRODUCTION_URL = 'https://api.lsk.lightspeed.app';

type Fetch = typeof fetch;

export class LightspeedApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Lightspeed ${status} ${code}`);
  }
}

interface ModifierGroup {
  productionInstructionGroupName?: string;
  productionInstructionList?: { instruction?: string; ikentooModifierId?: number | string }[];
}

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

export class LightspeedKAdapter implements PosAdapter {
  readonly provider = 'lightspeed-k';
  readonly version = '0.1.0';
  readonly kinds = ['POS'] as const;

  constructor(private readonly http: Fetch = (...a) => fetch(...a)) {}

  private async call<T>(conn: Connection, path: string, query: Record<string, string> = {}) {
    const base = conn.config.environment === 'production' ? PRODUCTION_URL : DEMO_URL;
    const q = new URLSearchParams({
      businessLocationId: str(conn.config.businessLocationId),
      ...query,
    });
    const res = await this.http(`${base}${path}?${q}`, {
      headers: {
        Authorization: `Bearer ${conn.secrets.accessToken ?? ''}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      throw new LightspeedApiError(res.status, body.code ?? body.error ?? 'HTTP_ERROR');
    }
    return (await res.json()) as T;
  }

  capabilities(): Promise<Capability[]> {
    return Promise.resolve(['menu.read', 'order.read', 'order.seat']);
  }

  /** Reading the till's buttons proves the token and the business location in one call. */
  async connect(conn: Connection): Promise<ConnectResult> {
    try {
      await this.listModifiers(conn);
      return {
        ok: true,
        info: { locationName: `Lightspeed ${str(conn.config.businessLocationId)}` },
      };
    } catch (e) {
      if (e instanceof LightspeedApiError)
        return {
          ok: false,
          error: e.status === 401 || e.status === 403 ? 'TOKEN_INVALID' : e.code,
        };
      return { ok: false, error: 'UNREACHABLE' };
    }
  }

  async health(conn: Connection): Promise<HealthStatus> {
    const r = await this.connect(conn);
    return r.ok ? { ok: true } : { ok: false, detail: r.error ?? 'ERROR' };
  }

  /**
   * The items on the open checks. shortcut: K-Series' item list sits in another API (Items,
   * scope items); until that is tried on the demo account, items appear here once rung up.
   */
  async listMenuItems(conn: Connection): Promise<CanonicalMenuItem[]> {
    const seen = new Map<string, string>();
    for (const o of await this.pullOrders(conn))
      for (const l of o.lines) seen.set(l.externalItemId, l.name);
    return [...seen]
      .map(([externalId, name]) => ({ externalId, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Every open check; already placed lines are skipped by their id, so no time filter. */
  async pullOrders(conn: Connection): Promise<CanonicalOrder[]> {
    const accounts = await this.call<LsAccount[]>(conn, '/o/op/1/order/table/getCheck');
    return (Array.isArray(accounts) ? accounts : []).flatMap((a) => {
      const o = toCanonicalOrder(a);
      return o ? [o] : [];
    });
  }

  async getOrder(conn: Connection, externalOrderId: string): Promise<CanonicalOrder | null> {
    try {
      const a = await this.call<LsAccount>(
        conn,
        `/o/op/1/order/accounts/${encodeURIComponent(externalOrderId)}`,
      );
      return accountId(a) ? toCanonicalOrder(a) : null;
    } catch (e) {
      if (e instanceof LightspeedApiError && e.status === 404) return null;
      throw e;
    }
  }

  /** The production instructions: K-Series' buttons for "Allergie: melk" or "Stoel 2". */
  async listModifiers(conn: Connection): Promise<string[]> {
    const groups = await this.call<ModifierGroup[]>(conn, '/o/op/1/menu/modifiers');
    const names = new Set<string>();
    for (const g of Array.isArray(groups) ? groups : [])
      for (const p of g.productionInstructionList ?? [])
        if (p.instruction?.trim()) names.add(p.instruction.trim());
    return [...names].sort((a, b) => a.localeCompare(b));
  }
}
