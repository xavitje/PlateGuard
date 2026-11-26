import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Authenticator-app codes (TOTP, RFC 6238): SHA-1, 6 digits, 30-second steps. */
const STEP_SECONDS = 30;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A new random key, base32 as authenticator apps expect it. */
export function newTotpSecret(): string {
  return base32(randomBytes(20));
}

/** The otpauth:// link an authenticator app reads (as a QR code, or typed in). */
export function totpUri(secret: string, account: string): string {
  const label = encodeURIComponent(`PlateGuard:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=PlateGuard&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', unbase32(secret)).update(counter).digest();
  const offset = h[h.length - 1]! & 0x0f;
  const n = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, '0');
}

export const totpStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

/**
 * The step the code belongs to, allowing one step of clock drift either way, or null. The caller
 * refuses a step it has seen before, so a code works only once.
 */
export function matchTotp(secret: string, code: string, now = Date.now()): number | null {
  const step = totpStep(now);
  for (const s of [step, step - 1, step + 1]) {
    const expected = Buffer.from(totpCode(secret, s));
    const given = Buffer.from(code);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return s;
  }
  return null;
}

export function base32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function unbase32(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const i = ALPHABET.indexOf(char);
    if (i < 0) throw new Error('Not a base32 key');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
