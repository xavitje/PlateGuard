import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DEMO_ALERTS, type DemoAlert } from '../demo';
import { PageTitle } from '../shell/TabsLayout';

const KIND_STYLE: Record<DemoAlert['kind'], string> = {
  stop: 'bg-red',
  missed: 'bg-red',
  warn: 'bg-amber',
  unknown: 'bg-[#8a909c]',
};

/** Everything that needs attention, newest first, filtered by role once auth exists. */
export function AlertsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'nl' ? 'nl' : 'en';
  return (
    <>
      <PageTitle>{t('alerts:title')}</PageTitle>
      <p className="mx-1.5 mb-2 text-[13px] font-semibold text-soft">
        {t('alerts:openCount', { count: DEMO_ALERTS.length })}
      </p>
      <section className="rounded-[18px] bg-card px-3.5">
        {DEMO_ALERTS.length === 0 && <p className="py-4 text-sm text-soft">{t('alerts:empty')}</p>}
        {DEMO_ALERTS.map((a) => (
          <Link
            key={a.id}
            to={`/tables/${a.table}`}
            className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 border-b border-line py-3 text-ink no-underline last:border-b-0"
          >
            <span
              className={`row-span-2 mt-0.5 size-[34px] rounded-[10px] ${KIND_STYLE[a.kind]}`}
              aria-hidden="true"
            />
            <b className="font-semibold">{t('tables:table', { label: a.table })}</b>
            <span className="text-[13px] text-soft">{a.text[lang]}</span>
          </Link>
        ))}
      </section>
      <p className="mx-1.5 mt-3 text-[13px] text-soft">
        {t('alerts:open')} · {t('alerts:done')} · {t('common:demoData')}
      </p>
    </>
  );
}
