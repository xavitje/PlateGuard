/**
 * Star CloudPRNT: the kitchen printer asks the server for work every few seconds over HTTPS, so
 * no port is opened in the restaurant and no bridge runs on a PC. Jobs wait in print_job until
 * the printer fetches them; the protocol endpoints live in the print module.
 */
import type {
  Capability,
  Connection,
  ConnectResult,
  HealthStatus,
  PrintResult,
  TicketPrinter,
} from '../../core/ports.js';
import { toPlainText, toStarMarkup, type TicketLine } from '../../core/ticket-document.js';

/** A printer that has not asked for work for this long is reported as offline. */
export const OFFLINE_AFTER_MS = 2 * 60_000;

/** What the server offers, best first. The printer takes the first one it supports. */
export const MEDIA_TYPES = ['text/vnd.star.markup', 'text/plain'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export class CloudPrntAdapter implements TicketPrinter {
  readonly provider = 'star-cloudprnt';
  readonly version = '1.0.0';
  readonly kinds = ['PRINTER'] as const;
  readonly mediaTypes = MEDIA_TYPES;

  capabilities(): Promise<Capability[]> {
    return Promise.resolve(['print.ticket']);
  }

  /** Nothing to call: the printer connects to us. It is active once it has the address. */
  connect(): Promise<ConnectResult> {
    return Promise.resolve({ ok: true });
  }

  health(conn: Connection): Promise<HealthStatus> {
    const seen =
      typeof conn.config.lastSeenAt === 'string' ? Date.parse(conn.config.lastSeenAt) : 0;
    return Promise.resolve(
      Date.now() - seen < OFFLINE_AFTER_MS ? { ok: true } : { ok: false, detail: 'NOT_POLLING' },
    );
  }

  /** Jobs are queued in the order's transaction; the printer fetches them itself. */
  print(): Promise<PrintResult> {
    return Promise.resolve({ ok: true });
  }

  render(lines: TicketLine[], type: string, width?: number): { type: MediaType; body: string } {
    return type === 'text/plain'
      ? { type, body: toPlainText(lines, width) }
      : { type: 'text/vnd.star.markup', body: toStarMarkup(lines, width) };
  }
}
