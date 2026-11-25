import { EU14 } from '@plateguard/domain';
import { SUPPORTED_LOCALES, type Locale } from '@plateguard/i18n';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';
import { Logo } from '../components/icons';
import { OutcomeBadge } from '../components/OutcomeBadge';
import { ALLERGEN_NAMES } from '../allergens';
import { ApiError } from '../api/client';
import { useClient } from '../service/ServiceProvider';

/**
 * Public allergen menu per location (QR per table). No tabs, no login. Shows the published menu
 * only, judged by the server for what the guest avoids; the choice stays in the address, so a
 * reload or a shared link keeps it. Picks the browser's language, with a switch. Never says "safe".
 */
export function GuestMenuPage() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation();
  const client = useClient();
  const lang = i18n.language === 'nl' ? 'nl' : 'en';
  const [params, setParams] = useSearchParams();
  const avoid = (params.get('avoid') ?? '').split(',').filter((c) => EU14.includes(c as never));
  const menu = useQuery({
    queryKey: ['guest-menu', slug, lang, avoid.join(',')],
    queryFn: () => client.guestMenu(slug, lang, avoid),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    // An unknown location stays unknown: say so at once.
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 1,
  });
  const toggle = (code: string) => {
    const next = avoid.includes(code) ? avoid.filter((c) => c !== code) : [...avoid, code];
    setParams(next.length ? { avoid: next.join(',') } : {}, { replace: true });
  };
  const dishes = [...(menu.data?.dishes ?? [])].sort((a, b) => a.course - b.course);

  return (
    <div className="mx-auto min-h-dvh max-w-2xl bg-bg px-4 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.03em]">
          <Logo size={32} /> {menu.data?.location.name}
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
        {EU14.map((code) => (
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
      {menu.isPending && <p className="text-soft">{t('common:loading')}</p>}
      {menu.isError && (
        <p role="alert" className="text-red">
          {t('guest:notFound')}
        </p>
      )}
      {menu.data && !menu.data.published && <p className="text-soft">{t('guest:notPublished')}</p>}
      <ul className="grid gap-2">
        {dishes.map((dish) => (
          <li key={dish.id} className="grid gap-1 rounded-2xl border border-line bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <b className="font-semibold">{dish.name}</b>
              {avoid.length > 0 && dish.outcome && <OutcomeBadge outcome={dish.outcome} />}
            </div>
            {avoid.length > 0 && dish.changes && dish.changes.length > 0 && (
              <p className="text-[13px] text-soft">
                {dish.changes
                  .map((c) =>
                    c.action === 'SUBSTITUTE'
                      ? t('guest:substitute', { from: c.componentName, to: c.substituteName ?? '' })
                      : t('guest:omit', { name: c.componentName }),
                  )
                  .join(' · ')}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[13px] text-soft">{t('guest:disclaimer')}</p>
    </div>
  );
}
