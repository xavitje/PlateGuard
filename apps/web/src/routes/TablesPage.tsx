import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DEMO_FLOORS, DEMO_KITCHEN_EVENTS, DEMO_TABLES } from '../demo';
import { useService } from '../service/ServiceProvider';
import { PageTitle } from '../shell/TabsLayout';

/**
 * Tables tab. Until the floor plan editor lands (phase 2), tables show as a numbered grid per floor.
 */
export function TablesPage() {
  const { t } = useTranslation();
  const [floor, setFloor] = useState<string>(DEMO_FLOORS[0]);
  const { state, alerts } = useService();
  const tables = DEMO_TABLES.filter((tb) => tb.floor === floor).map((tb) => ({
    ...tb,
    allergyGuests: Object.values(state[tb.label] ?? {}).filter((s) => s.allergies.length > 0)
      .length,
    openAlerts:
      alerts.filter((a) => a.table === tb.label).length +
      DEMO_KITCHEN_EVENTS.filter((e) => e.table === tb.label).length,
  }));

  return (
    <>
      <PageTitle>{t('tables:title')}</PageTitle>
      <div
        role="tablist"
        className="mb-3 flex gap-1.5 rounded-[14px] bg-[#e9ebef] p-1 dark:bg-card"
      >
        {DEMO_FLOORS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={floor === f}
            onClick={() => setFloor(f)}
            className={`min-h-[40px] flex-1 rounded-[11px] text-sm font-semibold ${floor === f ? 'bg-card shadow-sm' : 'text-soft'}`}
          >
            {f}
          </button>
        ))}
      </div>
      <p className="mx-1.5 mb-2 text-[13px] text-soft">{t('common:demoData')}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {tables.map((tb) => {
          const free = tb.guests === 0;
          return (
            <Link
              key={tb.label}
              to={`/tables/${tb.label}`}
              className={`press relative grid min-h-[78px] content-start gap-0.5 rounded-2xl p-2.5 text-ink no-underline ${
                free ? 'shadow-[inset_0_0_0_1.5px_var(--pg-line)]' : 'bg-card shadow-sm'
              }`}
            >
              <b
                className={`text-xl font-semibold tracking-[-0.02em] ${free ? 'text-[#9aa1ad]' : ''}`}
              >
                {tb.label}
              </b>
              <span className="text-xs text-soft">
                {free ? t('tables:free') : t('tables:guests', { count: tb.guests })}
              </span>
              {tb.allergyGuests > 0 && (
                <span className="text-xs font-medium text-brand-ink">
                  {t('tables:seat.allergyCount', { count: tb.allergyGuests })}
                </span>
              )}
              {tb.openAlerts > 0 && (
                <span className="absolute top-2.5 right-2.5 grid h-5 min-w-5 place-items-center rounded-full bg-red px-1.5 text-[11.5px] font-bold text-white">
                  {tb.openAlerts}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
