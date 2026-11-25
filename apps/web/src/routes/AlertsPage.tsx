import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { AlertKind } from '@plateguard/domain';
import { OutcomeBadge } from '../components/OutcomeBadge';
import { useAlerts } from '../service/ServiceProvider';
import { PageTitle } from '../shell/TabsLayout';

const KIND_STYLE: Record<AlertKind, string> = {
  stop: 'bg-red',
  warn: 'bg-amber',
  unknown: 'bg-[#8a909c]',
};

/**
 * Everything that needs attention. Order alerts come only from dishes a guest with an allergy
 * actually ordered, never from the menu. Kitchen events (a plate that skipped its check) join
 * with the kitchen phase. Filtered by role once login exists.
 */
export function AlertsPage() {
  const { t } = useTranslation();
  const { data: alerts = [], isError, isPending } = useAlerts();
  return (
    <>
      <PageTitle>{t('alerts:title')}</PageTitle>
      <p className="mx-1.5 mb-2 text-[13px] font-semibold text-soft">
        {isPending ? t('common:loading') : t('alerts:openCount', { count: alerts.length })}
      </p>
      {isError && (
        <p role="alert" className="mx-1.5 mb-3 text-sm text-red">
          {t('common:loadError')}
        </p>
      )}
      <section className="rounded-[18px] bg-card px-3.5">
        {!isPending && alerts.length === 0 && (
          <p className="py-4 text-sm text-soft">{t('alerts:empty')}</p>
        )}
        {alerts.map((a) => (
          <Link
            key={a.id}
            to={`/tables/${a.table}?seat=${a.seat}`}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-line py-3 text-ink no-underline last:border-b-0"
          >
            <span
              className={`row-span-2 mt-0.5 size-[34px] rounded-[10px] ${KIND_STYLE[a.kind]}`}
              aria-hidden="true"
            />
            <b className="font-semibold">{t('tables:table', { label: a.table })}</b>
            <span className="row-span-2">
              <OutcomeBadge outcome={a.result.outcome} />
            </span>
            <span className="text-[13px] text-soft">
              {t('alerts:ordered', { seat: a.seat, dish: a.dishName })}
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
      </section>
      <p className="mx-1.5 mt-3 text-[13px] text-soft">{t('alerts:fromOrders')}</p>
    </>
  );
}
