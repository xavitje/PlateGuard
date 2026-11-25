import { describe, expect, it } from 'vitest';
import { createI18n, resolveLocale } from '../src/index.js';

describe('i18n', () => {
  it('formats ICU plurals in English and Dutch', async () => {
    const en = await createI18n('en');
    const nl = await createI18n('nl');
    expect(en.t('tables:seat.allergyCount', { count: 0 })).toBe('No allergy');
    expect(en.t('tables:seat.allergyCount', { count: 2 })).toBe('2 allergies');
    expect(nl.t('tables:seat.allergyCount', { count: 1 })).toBe('1 allergie');
    expect(nl.t('common:outcome.DO_NOT_SERVE')).toBe('Niet serveren');
  });

  it('falls back to English for a key a locale does not have', async () => {
    const nl = await createI18n('nl', {
      resources: { en: { common: { onlyEnglish: 'Only in English' } }, nl: { common: {} } },
    });
    expect(nl.t('common:onlyEnglish')).toBe('Only in English');
  });

  it('resolves user, then location, then device language, then English', () => {
    expect(resolveLocale('nl', 'en')).toBe('nl');
    expect(resolveLocale(null, undefined, 'nl-BE')).toBe('nl');
    expect(resolveLocale('fr', 'de-DE')).toBe('en');
  });
});
