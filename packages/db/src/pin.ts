import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } satisfies ScryptOptions;
const KEYLEN = 32;

function derive(pin: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pin, salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** 4 to 6 digits: quick on a shared tablet, and locked after 5 failed tries. */
export const PIN_PATTERN = /^\d{4,6}$/;

/** scrypt with a random salt, stored as "scrypt$N$r$p$salt$hash" (base64url). */
export async function hashPin(pin: string): Promise<string> {
  if (!PIN_PATTERN.test(pin)) throw new Error('A PIN is 4 to 6 digits');
  return hashSecret(pin);
}

/** A platform admin's password: the same scrypt hash, at least 12 characters. Check with verifyPin. */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error('A password is at least 12 characters');
  return hashSecret(password);
}

async function hashSecret(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(pin, salt, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await derive(pin, Buffer.from(salt, 'base64url'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}
