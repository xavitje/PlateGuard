/**
 * Ports: the only way the core talks to the outside world. Each adapter implements one or more
 * of these for one brand. The core never asks "is this Lightspeed?", only
 * "which adapter of this location can order.read?".
 */
import type { CanonicalMenuItem, CanonicalOrder, KitchenTicket } from '@plateguard/contracts';

export type Capability =
  | 'menu.read' // fetch the menu and items, for mapping
  | 'order.read' // read a running table order
  | 'order.webhook' // a push when a new round is entered
  | 'order.seat' // seat and course number per line
  | 'order.allergens' // allergy per seat from the POS
  | 'order.annotate' // write a note or modifier back ("SEE ALLERGY TICKET")
  | 'kds.ticket' // put a block on the kitchen display
  | 'kds.confirm' // "ready" on the KDS reported back (enforcement)
  | 'print.ticket'; // print the allergy ticket

export type AdapterKind = 'POS' | 'KDS' | 'PRINTER';

/** A connection as adapters see it. Secrets are decrypted by the core just before the call. */
export interface Connection {
  id: string;
  locationId: string;
  provider: string;
  config: Record<string, unknown>;
  secrets: Record<string, string>;
}

export interface RawRequest {
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  ip?: string;
}

/** A translated inbound message, ready for the service module. */
export interface InboundEvent {
  /** External message id, or a hash of the body: duplicates are ignored. */
  idempotencyKey: string;
  type: 'order.updated' | 'order.closed' | 'ticket.confirmed';
  order?: CanonicalOrder;
  ticket?: TicketConfirmed;
}

export interface TicketConfirmed {
  externalTicketId: string;
  at: string;
}

export interface ConnectResult {
  ok: boolean;
  error?: string;
}

export interface HealthStatus {
  ok: boolean;
  detail?: string;
}

export interface ExternalOrderRef {
  externalOrderId: string;
  externalLineId?: string;
}

export interface ExternalTicketRef {
  externalTicketId: string;
}

export interface PrintResult {
  ok: boolean;
  jobId?: string;
}

export interface IntegrationAdapter {
  readonly provider: string; // 'lightspeed-k', 'mplus', 'escpos'
  readonly version: string;
  readonly kinds: readonly AdapterKind[];
  capabilities(conn: Connection): Promise<Capability[]>;
  connect(conn: Connection): Promise<ConnectResult>; // OAuth, keys, test
  health(conn: Connection): Promise<HealthStatus>;
}

export interface PosAdapter extends IntegrationAdapter {
  listMenuItems(conn: Connection): Promise<CanonicalMenuItem[]>;
  pullOrders(conn: Connection, since: Date): Promise<CanonicalOrder[]>;
  verifyWebhook?(req: RawRequest, conn: Connection): boolean;
  parseWebhook?(req: RawRequest): InboundEvent[];
  annotateOrder?(conn: Connection, ref: ExternalOrderRef, note: string): Promise<void>;
}

export interface KdsAdapter extends IntegrationAdapter {
  pushTicket(conn: Connection, t: KitchenTicket): Promise<ExternalTicketRef>;
  verifyWebhook?(req: RawRequest, conn: Connection): boolean;
  parseConfirm?(req: RawRequest): TicketConfirmed | null;
}

export interface PrinterAdapter extends IntegrationAdapter {
  print(conn: Connection, t: KitchenTicket): Promise<PrintResult>; // ESC/POS, CloudPRNT
}

export type AnyAdapter = PosAdapter | KdsAdapter | PrinterAdapter;

/** Adapters that can receive webhooks implement verifyWebhook. */
export function canVerifyWebhooks(
  a: AnyAdapter,
): a is AnyAdapter & { verifyWebhook(req: RawRequest, conn: Connection): boolean } {
  return typeof (a as { verifyWebhook?: unknown }).verifyWebhook === 'function';
}
