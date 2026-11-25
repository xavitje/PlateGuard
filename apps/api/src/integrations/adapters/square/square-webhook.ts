import { createHmac, timingSafeEqual } from 'node:crypto';

/** Square signs a notification with HMAC-SHA256 over the subscription's URL plus the raw body. */
export const SIGNATURE_HEADER = 'x-square-hmacsha256-signature';

export function squareSignature(signatureKey: string, url: string, body: Buffer | string): string {
  return createHmac('sha256', signatureKey).update(url).update(body).digest('base64');
}

export function verifySquareSignature(
  signatureKey: string,
  url: string,
  body: Buffer,
  header: string | string[] | undefined,
): boolean {
  const given = Array.isArray(header) ? header[0] : header;
  if (!signatureKey || !url || !given) return false;
  const a = Buffer.from(squareSignature(signatureKey, url, body));
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface SquareEvent {
  event_id?: string;
  type?: string;
  data?: { id?: string; type?: string; object?: Record<string, { order_id?: string }> };
}

/** The order an order.created or order.updated notification is about. */
export function orderIdOf(event: SquareEvent): string | undefined {
  if (!event.type?.startsWith('order.')) return undefined;
  const inner = Object.values(event.data?.object ?? {})[0];
  return inner?.order_id ?? event.data?.id;
}
