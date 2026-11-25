/**
 * Supported locales. To add one (for example German):
 *   1. copy locales/en/ to locales/de/ and translate it,
 *   2. add { code: 'de', name: 'Deutsch' } below,
 *   3. run pnpm --filter @plateguard/i18n generate (CI runs pnpm i18n:check),
 *   4. seed the allergen names in German (packages/db/prisma/seed-data/allergens.ts).
 */
export const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'nl', name: 'Nederlands' },
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number]['code'];

/** English is the source of every key and the fallback for a missing one. */
export const SOURCE_LOCALE: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.some((l) => l.code === value);
}

/** Pick the user's choice, then the location's default, then the device language, then English. */
export function resolveLocale(...candidates: (string | null | undefined)[]): Locale {
  for (const c of candidates) {
    if (!c) continue;
    if (isLocale(c)) return c;
    const base = c.toLowerCase().split('-')[0] ?? '';
    if (isLocale(base)) return base;
  }
  return SOURCE_LOCALE;
}
