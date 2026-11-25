import i18next, { type i18n, type InitOptions } from 'i18next';
import ICU from 'i18next-icu';
import { SOURCE_LOCALE, SUPPORTED_LOCALES, type Locale } from './config.js';
import { NAMESPACES, resources } from './resources.generated.js';

export * from './config.js';
export { NAMESPACES, resources };
export type Namespace = (typeof NAMESPACES)[number];

/**
 * A configured i18next instance with ICU messages (plurals, variables).
 * Keys are always written in full in code: t('tables:seat.allergyCount', { count }).
 */
export async function createI18n(locale: Locale, extra: Partial<InitOptions> = {}): Promise<i18n> {
  const instance = i18next.createInstance();
  instance.use(ICU);
  await instance.init({
    resources,
    lng: locale,
    fallbackLng: SOURCE_LOCALE,
    supportedLngs: SUPPORTED_LOCALES.map((l) => l.code),
    ns: [...NAMESPACES],
    defaultNS: 'common',
    nsSeparator: ':',
    keySeparator: '.',
    interpolation: { escapeValue: false },
    returnNull: false,
    ...extra,
  });
  return instance;
}
