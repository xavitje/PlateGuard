import { createHmac, timingSafeEqual } from 'node:crypto';

/** A shift session: who, at which location, until when. Signed with HMAC-SHA256 (a compact JWT). */
export interface SessionClaims {
  sub: string;
  loc: string;
  exp: number;
  /** A platform admin who opened this restaurant as its owner (their platform_admin id). */
  adm?: string;
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

const mac = (data: string, key: string) => createHmac('sha256', key).update(data).digest();

export function issueToken(
  claims: Omit<SessionClaims, 'exp'>,
  now = Date.now(),
  seconds = SESSION_SECONDS,
): { token: string; expiresAt: string } {
  return sign({ ...claims }, seconds, now);
}

/** The claims of a valid, unexpired shift token; null for anything else, a platform token too. */
export function readToken(token: string, now = Date.now()): SessionClaims | null {
  const claims = verify(token, now);
  if (!claims || claims.aud !== undefined) return null;
  if (typeof claims.sub !== 'string' || typeof claims.loc !== 'string') return null;
  if (claims.adm !== undefined && typeof claims.adm !== 'string') return null;
  return claims as unknown as SessionClaims;
}

/** A platform admin's session: not bound to any restaurant, and shorter than a shift. */
export interface PlatformClaims {
  sub: string;
  aud: 'platform';
  exp: number;
}

export const PLATFORM_SESSION_SECONDS = 8 * 60 * 60;

export function issuePlatformToken(
  adminId: string,
  now = Date.now(),
): { token: string; expiresAt: string } {
  return sign({ sub: adminId, aud: 'platform' }, PLATFORM_SESSION_SECONDS, now);
}

/** The claims of a valid, unexpired platform token; null for anything else, a shift token too. */
export function readPlatformToken(token: string, now = Date.now()): PlatformClaims | null {
  const claims = verify(token, now);
  if (!claims || claims.aud !== 'platform' || typeof claims.sub !== 'string') return null;
  return claims as unknown as PlatformClaims;
}

function sign(
  claims: Record<string, unknown>,
  seconds: number,
  now: number,
): { token: string; expiresAt: string } {
  const exp = Math.floor(now / 1000) + seconds;
  const body = `${HEADER}.${b64(JSON.stringify({ ...claims, exp }))}`;
  return {
    token: `${body}.${mac(body, secret()).toString('base64url')}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

function verify(token: string, now: number): Record<string, unknown> | null {
  const [header, payload, sig] = token.split('.');
  if (header !== HEADER || !payload || !sig) return null;
  const expected = mac(`${header}.${payload}`, secret());
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
      string,
      unknown
    >;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}
