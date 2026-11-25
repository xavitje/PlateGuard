import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { AlertResponse } from '@plateguard/contracts';
import type { AlertKind } from '@plateguard/domain';
import { OutcomeBadge } from '../components/OutcomeBadge';
import { useAlerts, useMarkAlertsRead } from '../service/ServiceProvider';
import { PageTitle } from '../shell/TabsLayout';

const KIND_STYLE: Record<AlertKind, string> = {
  stop: 'bg-red',
  warn: 'bg-amber',
  unknown: 'bg-[#8a909c]',
};

const FILTERS = ['all', 'unread', 'stop', 'warn', 'unknown'] as const;
type Filter = (typeof FILTERS)[number];
const shows = (f: Filter, a: AlertResponse) =>
  f === 'all' ? true : f === 'unread' ? !a.read : a.kind === f;

/**
 * Everything that needs attention. An opened alert stays in the list, marked read, until the
 * plate is served or removed; only unread alerts count on the tab. Order alerts come only from dishes a guest with an allergy
 * actually ordered, never from the menu, and from plates the kitchen sent back, with its reason.
 */
export function AlertsPage() {
  const { t } = useTranslation();
  const { data: alerts = [], isError, isPending } = useAlerts();
  const markRead = useMarkAlertsRead();
  const [filter, setFilter] = useState<Filter>('all');
  const unread = alerts.filter((a) => !a.read).length;
  const shown = alerts.filter((a) => shows(filter, a));
  return (
    <>
      <PageTitle>{t('alerts:title')}</PageTitle>
      <div className="mx-1.5 mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-soft">
          {isPending ? t('common:loading') : t('alerts:counts', { open: alerts.length, unread })}
        </p>
        <button
          type="button"
          disabled={unread === 0 || markRead.isPending}
          onClick={() => markRead.mutate(undefined)}
          className="min-h-9 text-[14px] font-semibold text-brand-ink disabled:text-soft disabled:opacity-60"
        >
          {t('alerts:markAll')}
        </button>
      </div>
      <div
        role="group"
        aria-label={t('alerts:filter')}
        className="scroll-x mb-3 flex gap-1.5 px-0.5"
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`min-h-9 shrink-0 rounded-full px-3.5 text-[14px] font-medium whitespace-nowrap ${
              filter === f ? 'bg-brand-soft font-semibold text-brand-ink' : 'bg-card text-ink'
            }`}
          >
            {t(`alerts:filters.${f}`, {
              count: alerts.filter((a) => shows(f, a)).length,
            })}
          </button>
        ))}
      </div>
      {isError && (
        <p role="alert" className="mx-1.5 mb-3 text-sm text-red">
          {t('common:loadError')}
        </p>
      )}
      <section className="rounded-[18px] bg-card px-3.5">
        {!isPending && shown.length === 0 && (
          <p className="py-4 text-sm text-soft">
            {alerts.length === 0 ? t('alerts:empty') : t('alerts:emptyFilter')}
          </p>
        )}
        {shown.map((a) => (
          <Link
            key={a.id}
            to={`/tables/${a.table}?seat=${a.seat}`}
            onClick={() => {
              if (!a.read) markRead.mutate([a.id]);
            }}
            className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-line py-3 text-ink no-underline last:border-b-0 ${
              a.read ? 'opacity-60' : ''
            }`}
          >
            <span
              className={`row-span-2 mt-0.5 size-[34px] rounded-[10px] ${KIND_STYLE[a.kind]}`}
              aria-hidden="true"
            />
            <span className="flex items-center gap-2">
              {!a.read && (
                <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              )}
              <b className={a.read ? 'font-medium' : 'font-semibold'}>
                {t('tables:table', { label: a.table })}
              </b>
              <span className="sr-only">
                {a.read ? t('alerts:readLabel') : t('alerts:unreadLabel')}
              </span>
            </span>
            <span className="row-span-2">
              <OutcomeBadge outcome={a.result.outcome} />
            </span>
            <span className="text-[13px] text-soft">
              {a.rejected && (
                <b className="block font-semibold text-red">
                  {t('alerts:rejected', { reason: a.rejected.reason })}
                </b>
              )}
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
