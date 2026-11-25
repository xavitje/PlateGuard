import type { TableSummary } from '@plateguard/contracts';
import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useFloors } from '../service/ServiceProvider';
import { PLAN_AREA, tableSize } from '../admin/FloorPlanCanvas';
import { PageTitle } from '../shell/TabsLayout';

/**
 * Tables tab, per floor. A floor whose tables are all placed in admin shows as its drawing;
 * otherwise as a numbered grid.
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
          className="scroll-x mb-3 flex gap-1.5 rounded-[14px] bg-[#e9ebef] p-1 dark:bg-card"
        >
          {floors.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={floor?.id === f.id}
              onClick={() => setFloor(f.id)}
              className={`min-h-[40px] flex-1 shrink-0 rounded-[11px] px-3 text-sm whitespace-nowrap font-semibold ${floor?.id === f.id ? 'bg-card shadow-sm' : 'text-soft'}`}
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
      {floor && floor.tables.length > 0 && floor.tables.every((tb) => tb.position) ? (
        <div
          role="group"
          aria-label={floor.name}
          className="relative aspect-[16/10] w-full overflow-hidden rounded-[18px] bg-card shadow-sm"
        >
          <div className={PLAN_AREA}>
            {floor.tables.map((tb) => {
              const size = tableSize(tb);
              return (
                <TableTile
                  key={tb.id}
                  table={tb}
                  style={{
                    left: `${tb.position!.x}%`,
                    top: `${tb.position!.y}%`,
                    width: `max(${size.w}%, 54px)`,
                    aspectRatio: `${size.w} / ${size.h}`,
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 place-content-center justify-items-center p-1 text-center ${
                    tb.shape === 'ROUND' ? 'rounded-full' : 'rounded-[12px]'
                  }`}
                  compact
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {floor?.tables.map((tb) => (
            <TableTile
              key={tb.id}
              table={tb}
              className="relative min-h-[78px] content-start rounded-2xl p-2.5"
            />
          ))}
        </div>
      )}
    </>
  );
}

function TableTile({
  table: tb,
  className,
  style,
  compact,
}: {
  table: TableSummary;
  className: string;
  style?: CSSProperties;
  /** On the drawing there is room for the number and the badges only. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const free = tb.guests === 0;
  return (
    <Link
      to={`/tables/${tb.label}`}
      style={style}
      aria-label={t('tables:table', { label: tb.label })}
      className={`press grid gap-0.5 text-ink no-underline ${className} ${
        free ? 'bg-mist shadow-[inset_0_0_0_1.5px_var(--pg-line)]' : 'bg-card shadow-sm'
      } ${compact && !free ? 'shadow-[inset_0_0_0_2px_var(--pg-brand)]' : ''}`}
    >
      <b
        className={`font-semibold tracking-[-0.02em] ${compact ? 'text-lg leading-none' : 'text-xl'} ${free ? 'text-[#9aa1ad]' : ''}`}
      >
        {tb.label}
      </b>
      {!compact && (
        <span className="text-xs text-soft">
          {free ? t('tables:free') : t('tables:guests', { count: tb.guests })}
        </span>
      )}
      {tb.allergyGuests > 0 && (
        <span
          className={`font-medium text-brand-ink ${compact ? 'text-[10.5px] leading-tight' : 'text-xs'}`}
        >
          {compact
            ? t('tables:allergyShort', { count: tb.allergyGuests })
            : t('tables:seat.allergyCount', { count: tb.allergyGuests })}
        </span>
      )}
      {tb.openAlerts > 0 && (
        <span
          className={`absolute grid h-5 min-w-5 place-items-center rounded-full bg-red px-1.5 text-[11.5px] font-bold text-white ${
            compact ? '-top-1.5 -right-1.5' : 'top-2.5 right-2.5'
          }`}
        >
          {tb.openAlerts}
        </span>
      )}
    </Link>
  );
}
