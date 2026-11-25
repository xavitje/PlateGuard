/**
 * A reference adapter for tests and local development: no network, orders come from memory.
 * Copy this folder to start a real adapter, and implement only the ports the system supports.
 */
import { createHash } from 'node:crypto';
import {
  CanonicalOrderZ,
  type CanonicalMenuItem,
  type CanonicalOrder,
} from '@plateguard/contracts';
import type {
  Capability,
  Connection,
  InboundEvent,
  PosAdapter,
  RawRequest,
} from '../../core/ports.js';

export class FakePosAdapter implements PosAdapter {
  readonly provider = 'fake-pos';
  readonly version = '0.1.0';
  readonly kinds = ['POS'] as const;

  constructor(
    private readonly menu: CanonicalMenuItem[] = [],
    private readonly orders: CanonicalOrder[] = [],
    private readonly caps: Capability[] = [
      'menu.read',
      'order.read',
      'order.webhook',
      'order.seat',
    ],
  ) {}

  async capabilities(): Promise<Capability[]> {
    return this.caps;
  }

  async connect() {
    return { ok: true };
  }

  async health() {
    return { ok: true };
  }

  async listMenuItems(): Promise<CanonicalMenuItem[]> {
    return this.menu;
  }

  async pullOrders(_conn: Connection, since: Date): Promise<CanonicalOrder[]> {
    return this.orders.filter((o) => new Date(o.openedAt) >= since);
  }

  verifyWebhook(req: RawRequest, conn: Connection): boolean {
    const expected = conn.secrets.webhookToken;
    return !!expected && req.headers['x-fake-token'] === expected;
  }

  parseWebhook(req: RawRequest): InboundEvent[] {
    const order = CanonicalOrderZ.parse(JSON.parse(req.body.toString('utf8')));
    const idempotencyKey = createHash('sha256').update(req.body).digest('hex');
    return [{ idempotencyKey, type: 'order.updated', order }];
  }
}
