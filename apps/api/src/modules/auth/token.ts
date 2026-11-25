import { createHmac, timingSafeEqual } from 'node:crypto';

/** A shift session: who, at which location, until when. Signed with HMAC-SHA256 (a compact JWT). */
export interface SessionClaims {
  sub: string;
  loc: string;
  exp: number;
}

/** One shift. After that the device asks for the PIN again. */
export const SESSION_SECONDS = 12 * 60 * 60;

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const HEADER = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET must be set (at least 16 characters)');
  return s;
}

const sign = (data: string, key: string) => createHmac('sha256', key).update(data).digest();

export function issueToken(
  claims: Omit<SessionClaims, 'exp'>,
  now = Date.now(),
): { token: string; expiresAt: string } {
  const exp = Math.floor(now / 1000) + SESSION_SECONDS;
  const body = `${HEADER}.${b64(JSON.stringify({ ...claims, exp }))}`;
  return {
    token: `${body}.${sign(body, secret()).toString('base64url')}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

/** The claims of a valid, unexpired token; null for anything else. */
export function readToken(token: string, now = Date.now()): SessionClaims | null {
  const [header, payload, sig] = token.split('.');
  if (header !== HEADER || !payload || !sig) return null;
  const expected = sign(`${header}.${payload}`, secret());
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionClaims;
    if (typeof claims.sub !== 'string' || typeof claims.loc !== 'string') return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}
