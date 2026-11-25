import type { KitchenTicketResponse } from '@plateguard/contracts';
import type { AllergySubject, ChecklistItem } from '@plateguard/domain';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import { useCan } from '../admin/hooks';
import { ALLERGEN_NAMES } from '../allergens';
import { OutcomeBadge } from '../components/OutcomeBadge';
import { useKitchen, useKitchenAction, useSession } from '../service/ServiceProvider';

const REASONS = ['unsafe', 'missing', 'wrong'] as const;

/**
 * Kitchen display: full screen, always dark, no tabs. Each allergy plate is a ticket with every
 * risk point; the cook ticks them all before the plate may go, or sends it back to the waiter.
 * With the pass check on, a runner checks the plate again before it is served.
 */
export function KitchenPage() {
  const { t } = useTranslation();
  const { signedIn } = useSession();
  const kitchen = useKitchen();
  const [selected, setSelected] = useState<string | null>(null);
  if (!signedIn) return <Navigate to="/login" replace />;

  const data = kitchen.data;
  const all = data ? [...data.queue, ...data.ready] : [];
  const ticket = all.find((tk) => tk.plateId === selected) ?? all[0];

  return (
    <div
      data-theme="kitchen"
      className="min-h-dvh bg-[#0b0c0f] px-2 pt-[max(env(safe-area-inset-top),8px)] pb-[max(env(safe-area-inset-bottom),8px)] text-[#f2f3f5] sm:px-4 sm:pt-[max(env(safe-area-inset-top),16px)] sm:pb-[max(env(safe-area-inset-bottom),16px)]"
    >
      <div className="mx-auto grid max-w-6xl gap-3 rounded-[22px] bg-[#111317] p-3 sm:gap-4 sm:p-[18px] md:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
        <header className="flex flex-wrap items-center justify-between gap-2 md:col-span-2">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{t('kitchen:title')}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#1d2026] px-3 py-1.5 text-[13px] text-[#9aa1ad]">
              {t('kitchen:queue', { count: data?.queue.length ?? 0 })}
            </span>
            {data?.passCheck && (
              <span className="rounded-full bg-[#1d2026] px-3 py-1.5 text-[13px] text-[#9aa1ad]">
                {t('kitchen:passCheckOn')}
              </span>
            )}
            <Link
              to="/profile"
              className="inline-flex min-h-10 items-center rounded-full bg-[#1d2026] px-3.5 text-[13px] text-[#9aa1ad] no-underline"
            >
              {t('kitchen:exit')}
            </Link>
          </div>
        </header>

        {kitchen.isError && (
          <p role="alert" className="text-[#ff8f92] md:col-span-2">
            {t('common:loadError')}
          </p>
        )}
        {kitchen.isPending && <p className="text-[#9aa1ad] md:col-span-2">{t('common:loading')}</p>}

        {data && (
          <nav aria-label={t('kitchen:title')} className="grid min-w-0 content-start gap-2">
            {data.queue.length === 0 && <p className="text-[#9aa1ad]">{t('kitchen:empty')}</p>}
            <TicketList tickets={data.queue} selected={ticket?.plateId} onSelect={setSelected} />
            {data.ready.length > 0 && (
              <>
                <h2 className="mt-3 text-[13px] font-semibold text-[#9aa1ad]">
                  {t('kitchen:atPass')}
                </h2>
                <TicketList
                  tickets={data.ready}
                  selected={ticket?.plateId}
                  onSelect={setSelected}
                />
              </>
            )}
          </nav>
        )}

        {ticket && (
          <TicketCard key={ticket.plateId} ticket={ticket} passCheck={!!data?.passCheck} />
        )}
      </div>
    </div>
  );
}

function TicketList({
  tickets,
  selected,
  onSelect,
}: {
  tickets: KitchenTicketResponse[];
  selected: string | undefined;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <ul className="scroll-x -mx-3 flex gap-2 px-3 sm:mx-0 sm:px-0 md:grid md:content-start md:overflow-visible">
      {tickets.map((tk) => (
        <li key={tk.plateId} className="shrink-0 max-md:min-w-[62%]">
          <button
            onClick={() => onSelect(tk.plateId)}
            aria-current={tk.plateId === selected}
            className={`press grid w-full gap-0.5 rounded-2xl bg-[#1a1d23] px-3.5 py-3 text-left ${
              tk.plateId === selected ? 'bg-[#22283a] shadow-[inset_0_0_0_2px_var(--pg-brand)]' : ''
            }`}
          >
            <b className="text-[19px] font-semibold tracking-[-0.02em]">
              {t('tables:table', { label: tk.table })} · {t('tables:seat.label', { seat: tk.seat })}
            </b>
            <small className="text-[#9aa1ad]">
              {tk.dishName}
              {tk.block && ` · ${t('kitchen:mustReject')}`}
              {tk.status === 'CHECKED' && ` · ${t('kitchen:status.CHECKED')}`}
              {tk.status === 'PASS_CHECKED' && ` · ${t('kitchen:status.PASS_CHECKED')}`}
            </small>
          </button>
        </li>
      ))}
    </ul>
  );
}

function useSubjectName() {
  const { i18n } = useTranslation();
  const lang = i18n.language === 'nl' ? 'nl' : 'en';
  return (s: AllergySubject) =>
    s.custom ?? s.ingredient?.name ?? ALLERGEN_NAMES[s.allergen ?? '']?.[lang] ?? s.allergen ?? '';
}

function ItemLabel({ item }: { item: ChecklistItem }) {
  const { t } = useTranslation();
  const name = useSubjectName();
  switch (item.kind) {
    case 'ALLERGY':
      return t('kitchen:item.allergy', {
        name: name(item.subject),
        severity: t(`common:severity.${item.severity}`),
      });
    case 'OMIT':
      return t('kitchen:item.omit', { name: item.componentName });
    case 'SUBSTITUTE':
      return t('kitchen:item.substitute', { from: item.componentName, to: item.substituteName });
    case 'MANUAL':
      return item.check === 'CUSTOM'
        ? t('kitchen:manualCheck', { label: item.label })
        : t('kitchen:manualCheckTraces', { label: item.label });
    case 'TRACES':
      return t('kitchen:item.traces', { name: name(item.subject) });
  }
}

function TicketCard({ ticket, passCheck }: { ticket: KitchenTicketResponse; passCheck: boolean }) {
  const { t } = useTranslation();
  const can = useCan();
  const name = useSubjectName();
  const action = useKitchenAction();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const toCheck = ticket.status === 'ASSESSED' || ticket.status === 'IN_KITCHEN';
  const left = ticket.checklist.filter((i) => !ticked.has(i.id)).length;
  const toggle = (id: string) =>
    setTicked((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const reject = (r: string) =>
    action.mutate({ kind: 'reject', plateId: ticket.plateId, reason: r });
  const big = 'press min-h-16 rounded-2xl px-4 text-[19px] font-semibold';
  const grey = `${big} bg-[#2a2e36] disabled:opacity-50`;

  return (
    <section
      aria-label={ticket.dishName}
      className="grid min-w-0 content-start gap-3 rounded-[18px] bg-[#1a1d23] p-3.5 sm:p-[18px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] text-[#9aa1ad]">
            {t('tables:table', { label: ticket.table })} ·{' '}
            {t('tables:seat.label', { seat: ticket.seat })}
          </p>
          <h2 className="text-[clamp(30px,3.6vw,40px)] leading-none font-bold tracking-[-0.035em]">
            {ticket.dishName}
          </h2>
        </div>
        <OutcomeBadge outcome={ticket.outcome} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ticket.allergies.map((a) => (
          <span
            key={a.allergen ?? a.ingredient?.id ?? a.custom}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              a.severity === 'SEVERE' ? 'bg-[rgba(229,72,77,0.18)] text-[#ff8f92]' : 'bg-[#2a2e36]'
            }`}
          >
            {name(a)} · {t(`common:severity.${a.severity}`)}
          </span>
        ))}
      </div>

      {ticket.block && (
        <p role="alert" className="rounded-xl bg-[rgba(229,72,77,0.18)] px-3.5 py-3 text-[17px]">
          {t(`kitchen:blocked.${ticket.block}`)}
        </p>
      )}

      {toCheck && ticket.checklist.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[13px] text-[#9aa1ad]">{t('kitchen:tickAll')}</legend>
          {ticket.checklist.map((item) => (
            <label
              key={item.id}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 text-[17px] leading-snug ${
                ticked.has(item.id) ? 'bg-[#1f2b22]' : 'bg-[#111317]'
              }`}
            >
              <input
                type="checkbox"
                className="size-6 accent-[var(--pg-brand)]"
                checked={ticked.has(item.id)}
                onChange={() => toggle(item.id)}
              />
              <span>
                <ItemLabel item={item} />
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {action.isError && (
        <p role="alert" className="text-[#ff8f92]">
          {t('kitchen:actionError')}
        </p>
      )}

      {rejecting ? (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) reject(reason.trim());
          }}
        >
          <p className="text-[15px]">{t('kitchen:rejectWhy')}</p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                className="press rounded-full bg-[#2a2e36] px-3.5 py-2 font-semibold"
                onClick={() => reject(t(`kitchen:reasons.${r}`))}
              >
                {t(`kitchen:reasons.${r}`)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
            <input
              aria-label={t('kitchen:rejectOther')}
              placeholder={t('kitchen:rejectOther')}
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-12 rounded-xl bg-[#111317] px-3.5 text-[17px]"
            />
            <button className={`${grey} min-h-12`} disabled={!reason.trim() || action.isPending}>
              {t('kitchen:rejectSend')}
            </button>
            <button
              type="button"
              className={`${grey} min-h-12`}
              onClick={() => setRejecting(false)}
            >
              {t('kitchen:rejectCancel')}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2 [&>*]:flex-1">
          {toCheck && !ticket.block && can('plate.check') && (
            <button
              className={`${big} bg-brand text-white disabled:cursor-not-allowed disabled:bg-[#2a2e36] disabled:text-[#9aa1ad]`}
              disabled={left > 0 || action.isPending}
              onClick={() =>
                action.mutate({ kind: 'check', plateId: ticket.plateId, checked: [...ticked] })
              }
            >
              {left > 0 ? t('kitchen:pointsLeft', { count: left }) : t('kitchen:confirm')}
            </button>
          )}
          {ticket.status === 'CHECKED' && passCheck && can('plate.pass_check') && (
            <button
              className={`${big} bg-brand text-white`}
              disabled={action.isPending}
              onClick={() => action.mutate({ kind: 'passCheck', plateId: ticket.plateId })}
            >
              {t('kitchen:passChecked')}
            </button>
          )}
          {(ticket.status === 'PASS_CHECKED' || (ticket.status === 'CHECKED' && !passCheck)) &&
            can('plate.serve') && (
              <button
                className={`${big} bg-brand text-white`}
                disabled={action.isPending}
                onClick={() => action.mutate({ kind: 'serve', plateId: ticket.plateId })}
              >
                {t('kitchen:served')}
              </button>
            )}
          {can('plate.reject') && (
            <button className={`${grey} flex-none`} onClick={() => setRejecting(true)}>
              {t('kitchen:reject')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
