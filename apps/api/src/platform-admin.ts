/**
 * Makes a platform admin, or gives an existing one a new password and authenticator key (to
 * recover a lost phone). The only way to make one: there is no route for it.
 *
 *   pnpm platform:admin you@example.com
 *
 * Runs against DATABASE_URL (from .env). Prints the password and the authenticator key once.
 */
import { randomBytes } from 'node:crypto';
import { hashPassword, PrismaClient } from '@plateguard/db';
import { newTotpSecret, totpUri } from './modules/platform/totp.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: pnpm platform:admin you@example.com');
  process.exit(1);
}

const prisma = new PrismaClient();
const password = randomBytes(18).toString('base64url');
const totpSecret = newTotpSecret();
const passwordHash = await hashPassword(password);
const data = { passwordHash, totpSecret, totpLastStep: null, failedTries: 0, lockedUntil: null };
await prisma.platformAdmin.upsert({ where: { email }, create: { email, ...data }, update: data });
await prisma.$disconnect();

console.log(`Platform admin ${email} is ready. Shown once, keep it in your password manager:

  Password:          ${password}
  Authenticator key: ${totpSecret}

Add the key to your authenticator app (type it in, or turn this link into a QR code):
  ${totpUri(totpSecret, email)}

Sign in at /platform with email, password and the 6-digit code.`);
