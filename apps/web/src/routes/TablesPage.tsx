import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useFloors } from '../service/ServiceProvider';
import { PageTitle } from '../shell/TabsLayout';

/**
 * Tables tab. Until the floor plan editor lands, tables show as a numbered grid per floor.
 */
export function TablesPage() {
  const { t } = useTranslation();
  const { data: floors = [], isError, isPending } = useFloors();
  const [chosen, setFloor] = useState<string | null>(null);
  const floor = floors.find((f) => f.id === chosen) ?? floors[0];

  return (
    <>
      <PageTitle>{t('tables:title')}</PageTitle>
      {floors.length > 1 && (
        <div
          role="tablist"
          className="mb-3 flex gap-1.5 rounded-[14px] bg-[#e9ebef] p-1 dark:bg-card"
        >
          {floors.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={floor?.id === f.id}
              onClick={() => setFloor(f.id)}
              className={`min-h-[40px] flex-1 rounded-[11px] text-sm font-semibold ${floor?.id === f.id ? 'bg-card shadow-sm' : 'text-soft'}`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}
      {isPending && <p className="mx-1.5 text-sm text-soft">{t('common:loading')}</p>}
      {isError && (
        <p role="alert" className="mx-1.5 text-sm text-red">
          {t('common:loadError')}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {floor?.tables.map((tb) => {
          const free = tb.guests === 0;
          return (
            <Link
              key={tb.id}
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
