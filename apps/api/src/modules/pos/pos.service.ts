import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  CanonicalOrder,
  PosConnectInput,
  PosEventsResponse,
  PosItemsResponse,
  PosMappingInput,
  PosOrderLog,
  PosResponse,
  PosSyncResult,
  PosTestOrderInput,
  PosWebhookInput,
} from '@plateguard/contracts';
import { ConnectionsRepository } from '../../integrations/core/connections.repository.js';
import { InboxDispatcher } from '../../integrations/core/inbox-dispatcher.js';
import { InboxRepository } from '../../integrations/core/inbox.repository.js';
import {
  isPosAdapter,
  isSandboxPos,
  type Connection,
  type InboundEvent,
  type PosAdapter,
  type SandboxPos,
} from '../../integrations/core/ports.js';
import { AdapterRegistry } from '../../integrations/core/registry.js';
import { openSecrets, sealSecrets, secretKey } from '../../integrations/core/secrets.js';
import type { TenantContext } from '../auth/permissions.js';
import { MenuRepository } from '../service/menu.repository.js';
import { ServiceService } from '../service/service.service.js';
import { POS_PROVIDER, PosRepository, type PosRow } from './pos.repository.js';

/** Pulling picks up the orders of the last hours: a service, not the whole day. */
const PULL_WINDOW_MS = 12 * 3600_000;
/**
 * A till without open tickets makes the order when it is paid, so it arrives already closed.
 * Those still go to the kitchen when they are this recent; older closed orders are left alone.
 */
const RECENT_CLOSED_MS = 2 * 3600_000;

const empty = (): PosSyncResult => ({
  orders: 0,
  plates: 0,
  duplicates: 0,
  unmapped: 0,
  noSeat: 0,
  noTable: 0,
  failed: 0,
  withoutAllergy: 0,
});

function add(a: PosSyncResult, b: PosSyncResult): PosSyncResult {
  const out = { ...a };
  for (const k of Object.keys(out) as (keyof PosSyncResult)[]) out[k] += b[k];
  return out;
}

const codeOf = (e: unknown) =>
  e instanceof HttpException
    ? ((e.getResponse() as { code?: string }).code ?? String(e.getStatus()))
    : null;

/**
 * The till as a source of orders. The waiter still records allergies per seat in PlateGuard;
 * what is rung up in the POS for that table and seat becomes a plate there, judged and sent to
 * the kitchen as if the waiter had ordered it in PlateGuard. A POS line becomes a plate once.
 */
@Injectable()
export class PosService implements OnModuleInit {
  constructor(
    private readonly repo: PosRepository,
    private readonly connections: ConnectionsRepository,
    private readonly inbox: InboxRepository,
    private readonly dispatcher: InboxDispatcher,
    private readonly registry: AdapterRegistry,
    private readonly service: ServiceService,
    private readonly menu: MenuRepository,
  ) {}

  onModuleInit(): void {
    this.dispatcher.handle((id) => this.handleStored(id).then(() => undefined));
  }

  // ─── Admin ───────────────────────────────────────────────────────────────

  async status(ctx: TenantContext, locationId: string): Promise<PosResponse> {
    const row = await this.repo.current(ctx, locationId);
    const secretsReady = secretKey() !== null;
    if (!row) return { connection: null, secretsReady };
    const last = await this.repo.lastEventAt(ctx, row.id);
    const c = row.config;
    return {
      secretsReady,
      connection: {
        id: row.id,
        provider: row.provider,
        status: row.status === 'ACTIVE' ? 'ACTIVE' : 'ERROR',
        locationName: typeof c.locationName === 'string' ? c.locationName : '',
        squareLocationId: typeof c.squareLocationId === 'string' ? c.squareLocationId : '',
        sandbox: c.environment !== 'production',
        webhookPath: `/hooks/${row.provider}/${row.id}`,
        webhookUrl: typeof c.webhookUrl === 'string' ? c.webhookUrl : null,
        lastEventAt: last?.toISOString() ?? null,
      },
    };
  }

  async connect(
    ctx: TenantContext,
    locationId: string,
    input: PosConnectInput,
    userId: string,
  ): Promise<PosResponse> {
    if (!secretKey()) throw new ServiceUnavailableException({ code: 'SECRET_KEY_MISSING' });
    if (await this.repo.current(ctx, locationId))
      throw new ConflictException({ code: 'POS_ALREADY_CONNECTED' });
    const config = {
      squareLocationId: input.squareLocationId,
      environment: 'sandbox',
      connectedById: userId,
    };
    const secrets = { accessToken: input.accessToken };
    const probe: Connection = { id: 'new', locationId, provider: POS_PROVIDER, config, secrets };
    const result = await this.adapter().connect(probe);
    if (!result.ok)
      throw new BadRequestException({
        code: 'POS_CONNECT_FAILED',
        details: { reason: result.error },
      });
    await this.repo.create(ctx, locationId, {
      provider: POS_PROVIDER,
      config: { ...config, ...result.info },
      secrets: sealSecrets(secrets),
    });
    return this.status(ctx, locationId);
  }

  async setWebhook(
    ctx: TenantContext,
    locationId: string,
    input: PosWebhookInput,
  ): Promise<PosResponse> {
    const { row, conn } = await this.require(ctx, locationId);
    // Square signs over the URL exactly as it was entered there, so it must point here.
    if (!new URL(input.url).pathname.endsWith(`/hooks/${row.provider}/${row.id}`))
      throw new BadRequestException({ code: 'WEBHOOK_URL_MISMATCH' });
    await this.repo.update(
      ctx,
      locationId,
      row.id,
      {
        config: { ...(row.config as object), webhookUrl: input.url },
        secrets: sealSecrets({ ...conn.secrets, signatureKey: input.signatureKey }),
      },
      'integration.webhook_set',
    );
    return this.status(ctx, locationId);
  }

  async disconnect(ctx: TenantContext, locationId: string): Promise<PosResponse> {
    const row = await this.repo.current(ctx, locationId);
    if (row) await this.repo.disable(ctx, locationId, row.id);
    return this.status(ctx, locationId);
  }

  async items(ctx: TenantContext, locationId: string): Promise<PosItemsResponse> {
    const { row, conn } = await this.require(ctx, locationId);
    const [items, mappings] = await Promise.all([
      this.call(() => this.adapter().listMenuItems(conn)),
      this.repo.mappings(ctx, row.id),
    ]);
    return {
      items: items.map((i) => ({
        externalId: i.externalId,
        name: i.name,
        dishId: mappings.get(i.externalId) ?? null,
      })),
    };
  }

  async map(
    ctx: TenantContext,
    locationId: string,
    input: PosMappingInput,
  ): Promise<PosItemsResponse> {
    const { row } = await this.require(ctx, locationId);
    await this.repo.setMappings(ctx, locationId, row.id, [input]);
    return this.items(ctx, locationId);
  }

  /**
   * Test accounts start empty: puts every dish of the published menu that is not linked yet in
   * it. An item already in the POS with the dish's name is linked instead of made again.
   */
  async pushMenu(ctx: TenantContext, locationId: string): Promise<PosItemsResponse> {
    const { row, conn } = await this.require(ctx, locationId);
    const [menu, mappings, existing] = await Promise.all([
      this.menu.current(ctx, locationId, 'en'),
      this.repo.mappings(ctx, row.id),
      this.call(() => this.adapter().listMenuItems(conn)),
    ]);
    const linked = new Set(mappings.values());
    const key = (name: string) => name.trim().toLocaleLowerCase();
    const free = new Map<string, string>();
    for (const item of existing)
      if (!mappings.has(item.externalId) && !free.has(key(item.name)))
        free.set(key(item.name), item.externalId);
    const links: { externalItemId: string; dishId: string }[] = [];
    const missing: { key: string; name: string }[] = [];
    for (const d of menu.dishes) {
      if (linked.has(d.id)) continue;
      const found = free.get(key(d.name));
      if (found) links.push({ externalItemId: found, dishId: d.id });
      else missing.push({ key: d.id, name: d.name });
    }
    const created = await this.call(() => this.sandbox().pushMenu(conn, missing));
    for (const [dishId, externalItemId] of created) links.push({ externalItemId, dishId });
    if (links.length > 0) await this.repo.setMappings(ctx, locationId, row.id, links);
    return this.items(ctx, locationId);
  }

  /** Rings up an order in the test POS, and takes it in at once instead of waiting for Square. */
  async testOrder(
    ctx: TenantContext,
    locationId: string,
    input: PosTestOrderInput,
  ): Promise<PosSyncResult> {
    const { row, conn } = await this.require(ctx, locationId);
    const byDish = new Map([...(await this.repo.mappings(ctx, row.id))].map(([e, d]) => [d, e]));
    const lines = input.lines.map((l) => {
      const externalItemId = byDish.get(l.dishId);
      if (!externalItemId) throw new BadRequestException({ code: 'DISH_NOT_IN_POS' });
      return { externalItemId, seat: l.seat };
    });
    const adapter = this.sandbox();
    const orderId = await this.call(() => adapter.placeOrder(conn, { table: input.table, lines }));
    const order = await this.call(async () => (await adapter.getOrder?.(conn, orderId)) ?? null);
    if (!order) return empty();
    const { result, log } = await this.ingest(ctx, row, order);
    await this.inbox.storeHandled(
      ctx,
      row.id,
      locationId,
      `test:${orderId}`,
      { externalOrderId: orderId, test: true },
      JSON.parse(JSON.stringify({ ...result, order: log })),
    );
    return result;
  }

  /** Fetches the open orders of the last hours, for when webhooks are not set up or missed. */
  async sync(ctx: TenantContext, locationId: string): Promise<PosSyncResult> {
    const { row, conn } = await this.require(ctx, locationId);
    const orders = await this.call(() =>
      this.adapter().pullOrders(conn, new Date(Date.now() - PULL_WINDOW_MS)),
    );
    let total = empty();
    for (const order of orders) total = add(total, (await this.ingest(ctx, row, order)).result);
    return total;
  }

  async events(ctx: TenantContext, locationId: string): Promise<PosEventsResponse> {
    const row = await this.repo.current(ctx, locationId);
    if (!row) return { events: [] };
    const rows = await this.inbox.recent(ctx, row.id);
    return {
      events: rows.map((e) => ({
        id: e.id,
        receivedAt: e.receivedAt.toISOString(),
        status: e.status,
        orderId: (e.payload as unknown as InboundEvent).externalOrderId ?? null,
        ...this.stored(e.result),
        rejected: (e.payload as { rejected?: string }).rejected ?? null,
        error: e.lastError,
      })),
    };
  }

  /** The stored result: the counts, and since the order log the order line by line. */
  private stored(raw: unknown): { result: PosSyncResult | null; order: PosOrderLog | null } {
    if (!raw || typeof raw !== 'object') return { result: null, order: null };
    const { order, ...counts } = raw as PosSyncResult & { order?: PosOrderLog };
    return { result: { ...empty(), ...counts }, order: order ?? null };
  }

  // ─── Orders coming in ────────────────────────────────────────────────────

  /** Handles what a webhook stored. Runs without a signed-in user, as the connection. */
  async handleStored(connectionId: string): Promise<PosSyncResult> {
    const record = await this.connections.findById(connectionId);
    let total = empty();
    if (!record?.active) return total;
    const conn = record.connection;
    const ctx = {
      organizationId: record.organizationId,
      locationIds: [conn.locationId],
      ...(typeof conn.config.connectedById === 'string'
        ? { userId: conn.config.connectedById }
        : {}),
    };
    const row: PosRow = {
      id: conn.id,
      status: 'ACTIVE',
      provider: conn.provider,
      config: conn.config,
      encryptedSecrets: null,
    };
    const adapter = this.adapterFor(conn.provider);
    for (const { id, payload } of await this.inbox.claimFor(connectionId)) {
      try {
        const event = payload as InboundEvent;
        const order =
          event.order ??
          (event.externalOrderId && adapter.getOrder
            ? await adapter.getOrder(conn, event.externalOrderId)
            : null);
        const { result, log } = order
          ? await this.ingest(ctx, row, order)
          : { result: empty(), log: { table: null, skipped: 'NOT_FOUND' as const, lines: [] } };
        total = add(total, result);
        await this.inbox.finish(id, {
          ok: true,
          result: JSON.parse(JSON.stringify({ ...result, order: log })),
        });
      } catch (e) {
        await this.inbox.finish(id, {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return total;
  }

  /**
   * An order's lines on the table's seats. Lines that cannot be placed are counted and logged
   * with the reason, not fatal, so admin can see per order what happened.
   */
  private async ingest(
    ctx: TenantContext,
    row: Pick<PosRow, 'id' | 'config'>,
    order: CanonicalOrder,
  ): Promise<{ result: PosSyncResult; log: PosOrderLog }> {
    const r = { ...empty(), orders: 1 };
    const log: PosOrderLog = { table: order.externalTableRef ?? null, skipped: null, lines: [] };
    const skip = (why: NonNullable<PosOrderLog['skipped']>, extra: Partial<PosSyncResult> = {}) => {
      log.skipped = why;
      return { result: { ...r, ...extra }, log };
    };
    if (order.status === 'CANCELLED') return skip('CANCELLED');
    if (
      order.status === 'CLOSED' &&
      Date.now() - new Date(order.openedAt).getTime() > RECENT_CLOSED_MS
    )
      return skip('CLOSED');
    const locationId = ctx.locationIds[0]!;
    const userId = ctx.userId ?? (row.config.connectedById as string | undefined);
    if (!order.externalTableRef || !userId) return skip('NO_TABLE', { noTable: 1 });
    const table = order.externalTableRef;
    const found = await this.service.table(ctx, locationId, table).catch(codeOf);
    if (found === 'TABLE_NOT_FOUND') return skip('TABLE_NOT_FOUND', { noTable: 1 });
    const allergic = new Set(
      typeof found === 'object' && found
        ? found.bySeat.filter((s) => s.allergies.length > 0).map((s) => s.seat)
        : [],
    );
    const mappings = await this.repo.mappings(ctx, row.id);
    for (const line of order.lines) {
      const entry = { name: line.name, seat: line.seat ?? null, quantity: line.quantity };
      const dishId = mappings.get(line.externalItemId);
      if (!dishId) {
        r.unmapped += line.quantity;
        log.lines.push({ ...entry, outcome: 'UNMAPPED' });
        continue;
      }
      if (!line.seat) {
        r.noSeat += line.quantity;
        log.lines.push({ ...entry, outcome: 'NO_SEAT' });
        continue;
      }
      for (let n = 0; n < line.quantity; n++) {
        const externalId = `${order.externalOrderId}:${line.externalLineId}:${n}`;
        const one = { ...entry, quantity: 1 };
        try {
          const plate = await this.service.place(
            ctx,
            locationId,
            table,
            line.seat,
            dishId,
            userId,
            { connectionId: row.id, externalId },
          );
          if (!plate) {
            r.duplicates++;
            log.lines.push({ ...one, outcome: 'DUPLICATE' });
          } else if (allergic.has(line.seat)) {
            r.plates++;
            log.lines.push({ ...one, outcome: 'PLACED' });
          } else {
            r.plates++;
            r.withoutAllergy++;
            log.lines.push({ ...one, outcome: 'PLACED_NO_ALLERGY' });
          }
        } catch (e) {
          const code = codeOf(e);
          // Two deliveries of the same line at once: the unique ref lets only one through.
          if ((e as { code?: string }).code === 'P2002') {
            r.duplicates++;
            log.lines.push({ ...one, outcome: 'DUPLICATE' });
          } else if (code) {
            r.failed++;
            log.lines.push({ ...one, outcome: 'FAILED', reason: code });
          } else throw e;
        }
      }
    }
    return { result: r, log };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async require(ctx: TenantContext, locationId: string) {
    const row = await this.repo.current(ctx, locationId);
    if (!row) throw new NotFoundException({ code: 'POS_NOT_CONNECTED' });
    const conn: Connection = {
      id: row.id,
      locationId,
      provider: row.provider,
      config: row.config,
      secrets: openSecrets(row.encryptedSecrets),
    };
    if (!conn.secrets.accessToken)
      throw new ServiceUnavailableException({ code: 'SECRET_KEY_MISSING' });
    return { row, conn };
  }

  private adapterFor(provider: string): PosAdapter {
    const adapter = this.registry.get(provider);
    if (!isPosAdapter(adapter)) throw new Error(`No POS adapter ${provider}`);
    return adapter;
  }

  private adapter(): PosAdapter {
    return this.adapterFor(POS_PROVIDER);
  }

  private sandbox(): SandboxPos {
    const adapter = this.registry.get(POS_PROVIDER);
    if (!isSandboxPos(adapter)) throw new Error(`No sandbox POS ${POS_PROVIDER}`);
    return adapter;
  }

  /** A failing POS call is a 502 with the POS's own code, so admin can say what went wrong. */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const status = (e as { status?: number }).status;
      const code = (e as { code?: string }).code;
      throw new HttpException(
        {
          code: 'POS_CALL_FAILED',
          details: { reason: status === 401 ? 'TOKEN_INVALID' : (code ?? 'UNREACHABLE') },
        },
        502,
      );
    }
  }
}
