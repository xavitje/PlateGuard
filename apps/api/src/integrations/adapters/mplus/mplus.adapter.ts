/**
 * MplusKASSA. Mplus sends webhooks itself: set up in the till under Beheer > Instellingen >
 * Webhooks with an endpoint URL, a subscription id and a secret key. Mplus posts to the URL
 * with the event's name after it (…/hooks/mplus/<connection>/addSessionLine) and signs the
 * body with HMAC-SHA256 under the Base64-decoded key, Base64 in X-Mplus-Signature.
 *
 * Every session event carries the session with all its lines, so a message is the whole
 * order as it stands; lines PlateGuard already placed are skipped by their id.
 *
 * Field names are from developers.mpluskassa.nl/webhooks/json-definitions: session.table
 * .number, session.lines[] with lineId, articleNumber, text, quantity, and
 * preparationMethods[] (sub-lines whose text is the preparation, such as "Allergie: melk").
 * shortcut: unverified against a live Mplus installation, and Mplus has no seats: a
 * preparation method "Stoel 2" gives the seat. Check both with the Tier 1 test account.
 *
 * Config: none needed. Secrets (encrypted): webhookSecret (Base64, as Mplus shows it), set
 * with the webhook in admin.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { CanonicalMenuItem, CanonicalOrder } from '@plateguard/contracts';
import type {
  Capability,
  Connection,
  ConnectResult,
  HealthStatus,
  InboundEvent,
  PosAdapter,
  RawRequest,
} from '../../core/ports.js';
import { seatInText, tableInText } from '../../core/pos-text.js';

export const SIGNATURE_HEADER = 'x-mplus-signature';

interface MplusLine {
  lineId?: string;
  extLineId?: string;
  articleNumber?: number | string;
  text?: string;
  quantity?: number | string;
  preparationMethods?: MplusLine[];
}

export interface MplusSession {
  sessionId?: string;
  table?: { number?: number | string; subNumber?: number | string; tableName?: string };
  lines?: MplusLine[];
}

export interface MplusEvent {
  session?: MplusSession;
  tableOrder?: { orderId?: string };
  order?: { orderId?: string };
}

/** Events that end or remove an order. */
const CLOSING = new Set(['completeSession', 'cancelSession', 'creditSession']);

export function mplusSignature(secretBase64: string, body: Buffer | string): string {
  return createHmac('sha256', Buffer.from(secretBase64, 'base64')).update(body).digest('base64');
}

export function toCanonicalOrder(e: MplusEvent, event = ''): CanonicalOrder | null {
  const s = e.session;
  const id = e.tableOrder?.orderId ?? s?.sessionId ?? e.order?.orderId;
  if (!s || !id) return null;
  const tableNo = s.table?.number;
  const table = tableNo === undefined ? tableInText(s.table?.tableName) : String(tableNo);
  return {
    externalOrderId: id,
    ...(table ? { externalTableRef: table } : {}),
    openedAt: new Date().toISOString(),
    status: event === 'cancelSession' ? 'CANCELLED' : CLOSING.has(event) ? 'CLOSED' : 'OPEN',
    lines: (s.lines ?? []).flatMap((l, i) => {
      const quantity = Math.floor(Number(l.quantity ?? 1));
      if (l.articleNumber === undefined || !(quantity > 0)) return [];
      const modifiers = (l.preparationMethods ?? []).flatMap((p) =>
        p.text?.trim() ? [p.text.trim()] : [],
      );
      const seat = seatInText(...modifiers);
      return [
        {
          externalLineId: l.lineId ?? l.extLineId ?? `${id}:${i}`,
          externalItemId: String(l.articleNumber),
          name: l.text ?? String(l.articleNumber),
          quantity,
          ...(seat !== undefined ? { seat } : {}),
          modifiers,
        },
      ];
    }),
  };
}

export class MplusAdapter implements PosAdapter {
  readonly provider = 'mplus';
  readonly version = '0.1.0';
  readonly kinds = ['POS'] as const;

  capabilities(): Promise<Capability[]> {
    return Promise.resolve(['order.read', 'order.webhook', 'order.seat']);
  }

  /** Mplus calls us; there is nothing to call back without its API account. */
  async connect(): Promise<ConnectResult> {
    return { ok: true };
  }

  async health(conn: Connection): Promise<HealthStatus> {
    return conn.secrets.webhookSecret ? { ok: true } : { ok: false, detail: 'SECRET_MISSING' };
  }

  /** shortcut: Mplus' article list needs its SOAP API (Tier 1 access); items appear once rung up. */
  async listMenuItems(): Promise<CanonicalMenuItem[]> {
    return [];
  }

  async pullOrders(): Promise<CanonicalOrder[]> {
    return [];
  }

  verifyWebhook(req: RawRequest, conn: Connection): boolean {
    const secret = conn.secrets.webhookSecret;
    const given = req.headers[SIGNATURE_HEADER];
    const sig = Array.isArray(given) ? given[0] : given;
    if (!secret || !sig) return false;
    const a = Buffer.from(mplusSignature(secret, req.body));
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** The event's name is the last part of the URL, which the hooks route passes as a header. */
  parseWebhook(req: RawRequest): InboundEvent[] {
    let e: MplusEvent;
    try {
      e = JSON.parse(req.body.toString('utf8')) as MplusEvent;
    } catch {
      return [];
    }
    const event = String(req.headers['x-plateguard-event'] ?? '');
    const order = toCanonicalOrder(e, event);
    if (!order) return [];
    const idempotencyKey = createHash('sha256').update(event).update(req.body).digest('hex');
    return [{ idempotencyKey, type: 'order.updated', order }];
  }
}
