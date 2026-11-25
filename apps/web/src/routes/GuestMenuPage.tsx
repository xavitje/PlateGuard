import { assess } from '@plateguard/domain';
import { SUPPORTED_LOCALES, type Locale } from '@plateguard/i18n';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from '../components/icons';
import { OutcomeBadge } from '../components/OutcomeBadge';
import { ALLERGEN_NAMES, QUICK_ALLERGENS } from '../allergens';
import { DEMO_DISHES } from '../demo';

/**
 * Public allergen menu per location (QR per table). No tabs, no login.
 * Picks the browser's language, with a language switch. Never says "safe".
 */
export function GuestMenuPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'nl' ? 'nl' : 'en';
  const [avoid, setAvoid] = useState<string[]>([]);
  const toggle = (code: string) =>
    setAvoid((a) => (a.includes(code) ? a.filter((c) => c !== code) : [...a, code]));
  const dishes = DEMO_DISHES.filter((d) => d.id !== 'd-special');

  return (
    <div className="mx-auto min-h-dvh max-w-2xl bg-bg px-4 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.03em]">
          <Logo size={32} /> Brasserie De Haven
        </div>
        <div className="flex gap-1">
          {SUPPORTED_LOCALES.map((l) => (
            <button
              key={l.code}
              onClick={() => void i18n.changeLanguage(l.code as Locale)}
              aria-pressed={i18n.language === l.code}
              className={`min-h-9 rounded-full px-3 text-sm font-semibold uppercase ${i18n.language === l.code ? 'bg-brand text-white' : 'bg-mist'}`}
            >
              {l.code}
            </button>
          ))}
        </div>
      </header>
      <h1 className="mb-3 text-[clamp(30px,8vw,36px)] font-semibold">{t('guest:title')}</h1>
      <p className="mb-2 text-sm font-semibold text-soft">{t('guest:filter')}</p>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {QUICK_ALLERGENS.map((code) => (
          <button
            key={code}
            onClick={() => toggle(code)}
            aria-pressed={avoid.includes(code)}
            className={`press min-h-9 rounded-full px-3.5 text-sm font-medium ${avoid.includes(code) ? 'bg-brand text-white' : 'bg-mist'}`}
          >
            {ALLERGEN_NAMES[code]?.[lang] ?? code}
          </button>
        ))}
      </div>
      <ul className="grid gap-2">
        {dishes.map((dish) => {
          const result = assess({
            dish,
            guest: avoid.map((allergen) => ({ allergen, severity: 'ALLERGY' as const })),
          });
          return (
            <li
              key={dish.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4"
            >
              <b className="font-semibold">{dish.name}</b>
              {avoid.length > 0 && <OutcomeBadge outcome={result.outcome} />}
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-[13px] text-soft">{t('guest:disclaimer')}</p>
    </div>
  );
}
