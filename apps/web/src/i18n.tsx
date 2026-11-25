import { createI18n, resolveLocale, type Locale } from '@plateguard/i18n';
import type { i18n } from 'i18next';
import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

const STORAGE_KEY = 'pg.locale';

function storedLocale(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Private mode: the choice lasts for this session only.
  }
}

/** User choice first, then the device language, then English. The location default joins once auth exists. */
export function initialLocale(): Locale {
  return resolveLocale(storedLocale(), navigator.language);
}

export function I18nProvider({ children, locale }: { children: ReactNode; locale?: Locale }) {
  const [instance, setInstance] = useState<i18n | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createI18n(locale ?? initialLocale()).then((i) => {
      if (!cancelled) {
        document.documentElement.lang = i.language;
        i.on('languageChanged', (lng) => (document.documentElement.lang = lng));
        setInstance(i);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (!instance) return null;
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
