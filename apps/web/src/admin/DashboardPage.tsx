import type { DashboardFigures } from '@plateguard/contracts';
import type { Outcome } from '@plateguard/domain';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OutcomeBadge } from '../components/OutcomeBadge';
import { useClient, useLocationId } from '../service/ServiceProvider';
import { PageHeader } from '../shell/TabsLayout';

const PERIODS = [7, 30, 90] as const;
const OUTCOMES: Outcome[] = [
  'DO_NOT_SERVE',
  'UNKNOWN',
  'CAUTION',
  'ADAPTABLE',
  'CLEAR_WITH_NOTE',
  'CLEAR',
];

/**
 * How allergy plates went over a period: how many, how the engine judged them, which checks
 * were skipped, how long they took, and the incidents. Per location and for the whole group.
 */
export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const client = useClient();
  const loc = useLocationId();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const q = useQuery({
    queryKey: ['admin', 'dashboard', loc, days],
    queryFn: () => client.admin.dashboard(loc!, days),
    enabled: !!loc,
  });
  const d = q.data;
  const num = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const mins = (m: number | null) =>
    m === null ? '—' : t('admin:dashboard.minutes', { value: num.format(m) });
  const group = (d?.locations.length ?? 0) > 1;

  return (
    <>
      <PageHeader
        title={t('admin:nav.dashboard')}
        description={group ? t('admin:dashboard.introGroup') : t('admin:dashboard.intro')}
        actions={
          <div
            role="radiogroup"
            aria-label={t('admin:dashboard.period')}
            className="flex rounded-[12px] bg-line/60 p-1"
          >
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={days === p}
                onClick={() => setDays(p)}
                className={`min-h-9 rounded-[9px] px-3.5 text-[14px] font-medium transition-colors duration-150 ${
                  days === p ? 'bg-raised font-semibold text-ink shadow-sm' : 'text-soft'
                }`}
              >
                {t('admin:dashboard.days', { count: p })}
              </button>
            ))}
          </div>
        }
      />

      {q.isError && <p className="text-red">{t('common:loadError')}</p>}
      {!d && !q.isError && <p className="text-soft">{t('common:loading')}</p>}
      {d && (
        <div className="grid gap-5">
          <Tiles f={d.total} mins={mins} />

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <section className="grid gap-3 rounded-[18px] bg-card p-4 shadow-card sm:p-5">
              <h2 className="font-semibold">{t('admin:dashboard.outcomesTitle')}</h2>
              <p className="text-[13.5px] text-soft">{t('admin:dashboard.outcomesHow')}</p>
              <ul className="grid gap-2">
                {OUTCOMES.map((o) => (
                  <li key={o} className="flex items-center justify-between gap-3">
                    <OutcomeBadge outcome={o} />
                    <span className="text-[15px] font-semibold tabular-nums">
                      {num.format(d.total.outcomes[o] ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="grid gap-3 rounded-[18px] bg-card p-4 shadow-card sm:p-5">
              <h2 className="font-semibold">{t('admin:dashboard.unknownTitle')}</h2>
              <p className="text-[13.5px] text-soft">{t('admin:dashboard.unknownHow')}</p>
              {d.unknownItems.length === 0 ? (
                <p className="text-soft">{t('admin:dashboard.unknownNone')}</p>
              ) : (
                <ul className="grid gap-1.5">
                  {d.unknownItems.map((u) => (
                    <li key={u.label} className="flex justify-between gap-3 text-[15px]">
                      <span>{u.label}</span>
                      <span className="font-semibold tabular-nums">{num.format(u.count)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="grid gap-3 rounded-[18px] bg-card p-4 shadow-card sm:p-5">
            <h2 className="font-semibold">{t('admin:dashboard.perLocation')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[14px]">
                <thead className="text-[12.5px] text-soft">
                  <tr className="border-b border-line">
                    <th className="py-2 pr-3 font-medium">{t('admin:dashboard.col.location')}</th>
                    {COLUMNS.map((c) => (
                      <th key={c} className="py-2 pr-3 text-right font-medium">
                        {t(`admin:dashboard.col.${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...d.locations,
                    ...(group
                      ? [{ id: 'total', name: t('admin:dashboard.total'), ...d.total }]
                      : []),
                  ].map((l) => (
                    <tr
                      key={l.id}
                      className={`border-b border-line last:border-b-0 ${l.id === 'total' ? 'font-semibold' : ''}`}
                    >
                      <th scope="row" className="py-2.5 pr-3 font-medium whitespace-nowrap">
                        {l.name}
                      </th>
                      {COLUMNS.map((c) => (
                        <td
                          key={c}
                          className={`py-2.5 pr-3 text-right tabular-nums ${
                            (c === 'noKitchenCheck' || c === 'noPassCheck') && (l[c] ?? 0) > 0
                              ? 'font-semibold text-red'
                              : ''
                          }`}
                        >
                          {c === 'checkMinutes' || c === 'serveMinutes'
                            ? mins(l[c])
                            : l[c] === null
                              ? '—'
                              : num.format(l[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

const COLUMNS = [
  'flagged',
  'rejected',
  'noKitchenCheck',
  'noPassCheck',
  'unknown',
  'checkMinutes',
  'serveMinutes',
  'openIncidents',
] as const satisfies readonly (keyof DashboardFigures)[];

function Tiles({ f, mins }: { f: DashboardFigures; mins: (m: number | null) => string }) {
  const { t, i18n } = useTranslation();
  const num = new Intl.NumberFormat(i18n.language);
  const tiles: { key: string; value: string; note?: string; alert?: boolean }[] = [
    { key: 'flagged', value: num.format(f.flagged) },
    { key: 'rejected', value: num.format(f.rejected) },
    {
      key: 'skipped',
      value: num.format(f.noKitchenCheck + (f.noPassCheck ?? 0)),
      note:
        f.noPassCheck === null
          ? t('admin:dashboard.skippedKitchen', { count: f.noKitchenCheck })
          : t('admin:dashboard.skippedBoth', {
              kitchen: f.noKitchenCheck,
              pass: f.noPassCheck,
            }),
      alert: f.noKitchenCheck + (f.noPassCheck ?? 0) > 0,
    },
    {
      key: 'unknown',
      value: num.format(f.unknown),
      note: t('admin:dashboard.customNote', { count: f.customAllergies }),
    },
    { key: 'checkTime', value: mins(f.checkMinutes) },
    { key: 'serveTime', value: mins(f.serveMinutes) },
    {
      key: 'incidents',
      value: num.format(f.incidents),
      note: t('admin:dashboard.openNote', { count: f.openIncidents }),
      alert: f.openIncidents > 0,
    },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {tiles.map((tile) => (
        <li
          key={tile.key}
          className="grid content-start gap-1 rounded-[16px] bg-card p-4 shadow-card"
        >
          <span className="text-[13px] font-medium text-soft">
            {t(`admin:dashboard.tile.${tile.key}`)}
          </span>
          <span
            className={`text-[28px] leading-tight font-semibold tracking-[-0.02em] tabular-nums ${
              tile.alert ? 'text-red' : ''
            }`}
          >
            {tile.value}
          </span>
          {tile.note && <span className="text-[12.5px] text-soft">{tile.note}</span>}
        </li>
      ))}
    </ul>
  );
}
