import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SaveError } from '../admin/ui';
import { platformApi } from '../api/platform';

/** Counts across every restaurant. Names and numbers only, never guest data. */
export function PlatformStats() {
  const { t, i18n } = useTranslation();
  const stats = useQuery({ queryKey: ['platform', 'stats'], queryFn: platformApi.stats });
  if (stats.isError) return <SaveError error={stats.error} />;
  const s = stats.data;
  if (!s) return null;
  const plans = Object.entries(s.byPlan)
    .sort((a, b) => b[1] - a[1])
    .map(([plan, n]) => `${n} ${t(`platform:plans.${plan}`, { defaultValue: plan })}`)
    .join(' · ');
  const week = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  const cols = ['signups', 'plates', 'warnings', 'overrides', 'incidents'] as const;
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-[22px] font-bold tracking-[-0.02em]">{t('platform:stats.title')}</h2>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label={t('platform:stats.restaurants')}
          value={s.restaurants}
          note={`${t('platform:stats.locations', { count: s.locations })} · ${plans}`}
        />
        <Tile
          label={t('platform:stats.active7')}
          value={s.active7}
          note={t('platform:stats.activeHint')}
        />
        <Tile
          label={t('platform:stats.active30')}
          value={s.active30}
          note={t('platform:stats.activeHint')}
        />
        <Tile
          label={t('platform:stats.incidents30')}
          value={s.incidents30.HIGH + s.incidents30.MEDIUM + s.incidents30.LOW}
          note={t('platform:stats.severity', {
            high: s.incidents30.HIGH,
            medium: s.incidents30.MEDIUM,
            low: s.incidents30.LOW,
          })}
        />
      </div>
      <div className="overflow-x-auto rounded-[14px] bg-card shadow-card">
        <table className="w-full min-w-[640px] text-[14px] whitespace-nowrap tabular-nums">
          <caption className="px-4 pt-3 text-left text-[13.5px] font-medium text-soft">
            {t('platform:stats.weekly')}
          </caption>
          <thead>
            <tr className="border-b border-line text-left text-[12.5px] text-soft">
              <th scope="col" className="px-4 py-2 font-medium">
                {t('platform:stats.week')}
              </th>
              {cols.map((c) => (
                <th key={c} scope="col" className="px-4 py-2 text-right font-medium">
                  {t(`platform:stats.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...s.weeks].reverse().map((w) => (
              <tr key={w.week} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-4 py-2 text-left font-normal">
                  {week(w.week)}
                </th>
                {cols.map((c) => (
                  <td key={c} className={`px-4 py-2 text-right ${w[c] ? '' : 'text-soft'}`}>
                    {w[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: number; note: ReactNode }) {
  return (
    <div className="rounded-[14px] bg-card p-4 shadow-card">
      <p className="text-[13px] font-medium text-soft">{label}</p>
      <p className="text-[28px] font-bold tracking-[-0.02em] tabular-nums">{value}</p>
      <p className="text-[12.5px] text-soft">{note}</p>
    </div>
  );
}
