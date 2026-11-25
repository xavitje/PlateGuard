import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Outgoing webhooks are signed with HMAC-SHA256 in the PlateGuard-Signature header:
 *   PlateGuard-Signature: t=<unix seconds>,v1=<hex hmac of "<t>.<body>">
 * The timestamp guards against replay; receivers reject anything older than the tolerance.
 */
export const SIGNATURE_HEADER = 'PlateGuard-Signature';
const DEFAULT_TOLERANCE_SECONDS = 300;

export function sign(
  secret: string,
  body: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

export function verify(
  secret: string,
  body: string,
  header: string | undefined,
  now: number = Math.floor(Date.now() / 1000),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isInteger(t) || !v1 || Math.abs(now - t) > toleranceSeconds) return false;
  const expected = Buffer.from(sign(secret, body, t).split('v1=')[1]!, 'hex');
  const given = Buffer.from(v1, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Retry with growing waits, about 22 hours in total; after that the delivery is dead-lettered. */
const RETRY_SCHEDULE_SECONDS = [10, 30, 120, 600, 1800, 3600, 3 * 3600, 6 * 3600, 12 * 3600];

export function nextAttemptDelaySeconds(attempt: number): number | null {
  return RETRY_SCHEDULE_SECONDS[attempt] ?? null;
}
