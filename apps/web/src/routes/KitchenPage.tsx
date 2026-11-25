import { assess, type GuestAllergy } from '@plateguard/domain';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { OutcomeBadge } from '../components/OutcomeBadge';
import { ALLERGEN_NAMES } from '../allergens';
import { DEMO_DISHES } from '../demo';

interface Ticket {
  id: string;
  table: string;
  seat: number;
  dishId: string;
  guest: GuestAllergy[];
}

const TICKETS: Ticket[] = [
  {
    id: 't1',
    table: '12',
    seat: 3,
    dishId: 'd-steak',
    guest: [
      { allergen: 'GLUTEN', severity: 'SEVERE' },
      { allergen: 'MILK', severity: 'INTOLERANCE' },
    ],
  },
  {
    id: 't2',
    table: '7',
    seat: 2,
    dishId: 'd-salad',
    guest: [
      { allergen: 'GLUTEN', severity: 'ALLERGY' },
      { ingredient: { id: 'i-egg', name: 'Egg yolk' }, severity: 'INTOLERANCE' },
      { custom: 'Sesame oil', severity: 'ALLERGY' },
    ],
  },
];

/**
 * Kitchen display: full screen, always dark, no tabs. Device mode, locked by a manager PIN.
 * One confirmation per plate; every point on the allergy ticket is shown.
 */
export function KitchenPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'nl' ? 'nl' : 'en';
  const [selected, setSelected] = useState(TICKETS[0]!.id);
  const [done, setDone] = useState<Set<string>>(new Set());
  const ticket = TICKETS.find((tk) => tk.id === selected)!;
  const dish = DEMO_DISHES.find((d) => d.id === ticket.dishId)!;
  const result = useMemo(() => assess({ dish, guest: ticket.guest }), [dish, ticket]);
  // Do not serve, or unknown from the recipe data, cannot be confirmed. Custom allergies are checked by hand.
  const blocked = result.perAllergy.some(
    (r) => r.outcome === 'DO_NOT_SERVE' || (r.outcome === 'UNKNOWN' && r.custom === undefined),
  );

  return (
    <div
      data-theme="kitchen"
      className="min-h-dvh bg-[#0b0c0f] px-2 pt-[max(env(safe-area-inset-top),8px)] pb-[max(env(safe-area-inset-bottom),8px)] text-[#f2f3f5] sm:px-4 sm:pt-[max(env(safe-area-inset-top),16px)] sm:pb-[max(env(safe-area-inset-bottom),16px)]"
    >
      <div className="mx-auto grid max-w-6xl gap-3 rounded-[22px] bg-[#111317] p-3 sm:gap-4 sm:p-[18px] md:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
        <header className="flex flex-wrap items-center justify-between gap-2 md:col-span-2">
          <b className="text-[22px] font-semibold tracking-[-0.02em]">{t('kitchen:title')}</b>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#1d2026] px-3 py-1.5 text-[13px] text-[#9aa1ad]">
              {t('kitchen:queue', { count: TICKETS.length - done.size })}
            </span>
            <Link
              to="/profile"
              className="inline-flex min-h-10 items-center rounded-full bg-[#1d2026] px-3.5 text-[13px] text-[#9aa1ad] no-underline"
            >
              {t('kitchen:exit')}
            </Link>
          </div>
        </header>

        <ul className="scroll-x -mx-3 flex gap-2 px-3 sm:mx-0 sm:px-0 md:grid md:content-start md:overflow-visible">
          {TICKETS.map((tk) => (
            <li key={tk.id} className="shrink-0 max-md:min-w-[62%]">
              <button
                onClick={() => setSelected(tk.id)}
                className={`press grid w-full gap-0.5 rounded-2xl bg-[#1a1d23] px-3.5 py-3 text-left ${
                  tk.id === selected ? 'bg-[#22283a] shadow-[inset_0_0_0_2px_var(--pg-brand)]' : ''
                } ${done.has(tk.id) ? 'opacity-50' : ''}`}
              >
                <b className="text-[19px] font-semibold tracking-[-0.02em]">
                  {t('tables:table', { label: tk.table })} ·{' '}
                  {t('tables:seat.label', { seat: tk.seat })}
                </b>
                <small className="text-[#9aa1ad]">
                  {DEMO_DISHES.find((d) => d.id === tk.dishId)?.name}
                </small>
              </button>
            </li>
          ))}
        </ul>

        <section className="grid min-w-0 content-start gap-3 rounded-[18px] bg-[#1a1d23] p-3.5 sm:p-[18px]">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[clamp(30px,3.6vw,40px)] leading-none font-bold tracking-[-0.035em]">
              {dish.name}
            </div>
            <OutcomeBadge outcome={result.outcome} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.perAllergy.map((a) => (
              <span
                key={a.allergen ?? a.ingredient?.id ?? a.custom}
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  a.severity === 'SEVERE'
                    ? 'bg-[rgba(229,72,77,0.18)] text-[#ff8f92]'
                    : 'bg-[#2a2e36]'
                }`}
              >
                {a.custom ??
                  a.ingredient?.name ??
                  ALLERGEN_NAMES[a.allergen ?? '']?.[lang] ??
                  a.allergen}{' '}
                · {t(`common:severity.${a.severity}`)}
              </span>
            ))}
          </div>
          <ul className="grid gap-2">
            {result.modifications.map((m) => (
              <li
                key={m.componentId}
                className="rounded-xl bg-[#111317] px-3.5 py-3 text-[17px] leading-snug"
              >
                {m.action === 'SUBSTITUTE'
                  ? `${m.componentName} → ${m.substitute?.name}`
                  : `− ${m.componentName}`}
              </li>
            ))}
            {result.manualChecks.map((m) => (
              <li
                key={`${m.kind}:${m.label}`}
                className="rounded-xl bg-[#111317] px-3.5 py-3 text-[17px] leading-snug"
              >
                {m.kind === 'CUSTOM'
                  ? t('kitchen:manualCheck', { label: m.label })
                  : t('kitchen:manualCheckTraces', { label: m.label })}
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <button
              onClick={() => setDone((d) => new Set(d).add(ticket.id))}
              disabled={blocked}
              className={`press col-span-2 min-h-16 rounded-2xl text-[19px] font-semibold sm:col-span-1 ${
                done.has(ticket.id) ? 'bg-[#2a2e36] text-[#cfd3da]' : 'bg-brand text-white'
              } disabled:cursor-not-allowed disabled:bg-[#2a2e36] disabled:text-[#9aa1ad]`}
            >
              {done.has(ticket.id) ? t('kitchen:confirmed') : t('kitchen:confirm')}
            </button>
            <button className="press min-h-16 rounded-2xl bg-[#2a2e36] px-4 font-semibold">
              {t('kitchen:reject')}
            </button>
            <button className="press min-h-16 rounded-2xl bg-[#2a2e36] px-4 font-semibold">
              {t('kitchen:remake')}
            </button>
          </div>
          <p className="text-[13px] text-[#9aa1ad]">
            {t('kitchen:seeAllergyTicket')} · {t('common:demoData')}
          </p>
        </section>
      </div>
    </div>
  );
}
