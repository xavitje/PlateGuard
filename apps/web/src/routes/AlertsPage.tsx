import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { OutcomeBadge } from '../components/OutcomeBadge';
import { DEMO_KITCHEN_EVENTS } from '../demo';
import type { AlertKind } from '../service/alerts';
import { useService } from '../service/ServiceProvider';
import { PageTitle } from '../shell/TabsLayout';

const KIND_STYLE: Record<AlertKind, string> = {
  stop: 'bg-red',
  missed: 'bg-red',
  warn: 'bg-amber',
  unknown: 'bg-[#8a909c]',
};

const ROW =
  'grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-line py-3 text-ink no-underline last:border-b-0';

/**
 * Everything that needs attention. Order alerts come only from dishes a guest with an allergy
 * actually ordered, never from the menu. Filtered by role once auth exists.
 */
export function AlertsPage() {
  const { t } = useTranslation();
  const { alerts } = useService();
  const count = alerts.length + DEMO_KITCHEN_EVENTS.length;
  return (
    <>
      <PageTitle>{t('alerts:title')}</PageTitle>
      <p className="mx-1.5 mb-2 text-[13px] font-semibold text-soft">
        {t('alerts:openCount', { count })}
      </p>
      <section className="rounded-[18px] bg-card px-3.5">
        {count === 0 && <p className="py-4 text-sm text-soft">{t('alerts:empty')}</p>}
        {alerts.map((a) => (
          <Link key={a.id} to={`/tables/${a.table}?seat=${a.seat}`} className={ROW}>
            <span
              className={`row-span-2 mt-0.5 size-[34px] rounded-[10px] ${KIND_STYLE[a.kind]}`}
              aria-hidden="true"
            />
            <b className="font-semibold">{t('tables:table', { label: a.table })}</b>
            <span className="row-span-2">
              <OutcomeBadge outcome={a.result.outcome} />
            </span>
            <span className="text-[13px] text-soft">
              {t('alerts:ordered', { seat: a.seat, dish: a.dish.name })}
              {a.result.modifications.length > 0 &&
                ` · ${a.result.modifications
                  .map((m) =>
                    m.action === 'SUBSTITUTE'
                      ? `${m.componentName} → ${m.substitute?.name}`
                      : `− ${m.componentName}`,
                  )
                  .join(', ')}`}
            </span>
          </Link>
        ))}
        {DEMO_KITCHEN_EVENTS.map((e) => (
          <Link key={e.id} to={`/tables/${e.table}`} className={ROW}>
            <span
              className={`row-span-2 mt-0.5 size-[34px] rounded-[10px] ${KIND_STYLE[e.kind]}`}
              aria-hidden="true"
            />
            <b className="col-span-2 font-semibold">{t('tables:table', { label: e.table })}</b>
            <span className="col-span-2 text-[13px] text-soft">
              {t('alerts:missedPlate', { plate: e.plate })}
            </span>
          </Link>
        ))}
      </section>
      <p className="mx-1.5 mt-3 text-[13px] text-soft">
        {t('alerts:fromOrders')} · {t('common:demoData')}
      </p>
    </>
  );
}
