import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Connection secrets (POS tokens, webhook keys) are stored encrypted with AES-256-GCM. The key
 * comes from INTEGRATION_SECRET_KEY, a server-side environment variable that never reaches the
 * database or the browser. Without it, nothing can be connected.
 */
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SecretKeyMissingError extends Error {
  constructor() {
    super('INTEGRATION_SECRET_KEY is not set');
  }
}

/** The 32-byte key, or null when the variable is missing or too short to be a real secret. */
export function secretKey(raw = process.env.INTEGRATION_SECRET_KEY): Buffer | null {
  if (!raw || raw.trim().length < 32) return null;
  return createHash('sha256').update(raw.trim()).digest();
}

export function sealSecrets(secrets: Record<string, string>, key = secretKey()): Uint8Array {
  if (!key) throw new SecretKeyMissingError();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(secrets), 'utf8'), cipher.final()]);
  return new Uint8Array(Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]));
}

/** The secrets, or an empty object when there are none or they cannot be read with this key. */
export function openSecrets(
  sealed: Uint8Array | null | undefined,
  key = secretKey(),
): Record<string, string> {
  if (!sealed || !key) return {};
  const buf = Buffer.from(sealed);
  if (buf[0] !== VERSION || buf.length < 1 + IV_BYTES + TAG_BYTES) return {};
  try {
    const iv = buf.subarray(1, 1 + IV_BYTES);
    const tag = buf.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const text = Buffer.concat([
      decipher.update(buf.subarray(1 + IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(text) as Record<string, string>;
  } catch {
    return {};
  }
}
