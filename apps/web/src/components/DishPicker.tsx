import type { MenuDish } from '@plateguard/contracts';
import { normalizeLabel, type Assessment } from '@plateguard/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AssessmentDetails } from './AssessmentDetails';
import { ChevronLeft, Plus } from './icons';
import { OutcomeBadge } from './OutcomeBadge';

type Mode = 'grid' | 'list';
const MODE_KEY = 'pg.dishPicker';

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}
function saveMode(mode: Mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}

interface Props {
  title: string;
  dishes: MenuDish[];
  /** The seat has allergies: show each dish's outcome. */
  judged: boolean;
  verdictOf: (dishId: string) => Assessment;
  /** With a note when the waiter confirmed a "do not serve" dish. */
  onOrder: (dish: MenuDish, note?: string) => void;
}

/**
 * Choosing a dish for a seat, two ways the waiter can switch between and the device remembers:
 * - a list with a search bar and filters per category, everything one tap from ordering;
 * - a till-style grid: categories, then subcategories when there are any, then the dishes. A
 *   tap on a dish orders it and the grid stays in that category for the next one.
 * Without categories set in Recipes, dishes are grouped by course. A dish that must not be
 * served to this guest is only ordered after the waiter confirms it and says why.
 */
export function DishPicker({ title, dishes, judged, verdictOf, onOrder }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>(readMode);
  const [added, setAdded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<MenuDish | null>(null);
  const groupOf = (d: MenuDish) =>
    d.category ??
    (d.course >= 1 && d.course <= 3
      ? t(`tables:pick.course.${d.course}`)
      : t('tables:pick.course.other', { course: d.course }));
  const place = (d: MenuDish, note?: string) => {
    onOrder(d, note);
    setAdded(d.name);
  };
  const order = (d: MenuDish) => {
    if (judged && verdictOf(d.id).outcome === 'DO_NOT_SERVE') setConfirming(d);
    else place(d);
  };
  const choose = (m: Mode) => {
    setMode(m);
    saveMode(m);
  };

  return (
    <>
      <div className="mx-1.5 mt-4 mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold tracking-normal text-soft">{title}</h2>
        <div
          role="group"
          aria-label={t('tables:pick.view')}
          className="flex rounded-full bg-mist p-0.5 text-[13px] font-semibold"
        >
          {(['list', 'grid'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => choose(m)}
              className={`min-h-8 rounded-full px-3 ${mode === m ? 'bg-card text-ink shadow-sm' : 'text-soft'}`}
            >
              {t(`tables:pick.${m}`)}
            </button>
          ))}
        </div>
      </div>
      <p role="status" className="sr-only">
        {added ? t('tables:pick.added', { dish: added }) : ''}
      </p>
      {mode === 'list' ? (
        <DishList
          dishes={dishes}
          judged={judged}
          verdictOf={verdictOf}
          groupOf={groupOf}
          onOrder={order}
        />
      ) : (
        <DishGrid
          dishes={dishes}
          judged={judged}
          verdictOf={verdictOf}
          groupOf={groupOf}
          onOrder={order}
          added={added}
        />
      )}
      {confirming && (
        <ConfirmDoNotServe
          dish={confirming}
          onCancel={() => setConfirming(null)}
          onConfirm={(note) => {
            place(confirming, note);
            setConfirming(null);
          }}
        />
      )}
    </>
  );
}

/**
 * Ordering a dish the guest must not have: the waiter confirms it and writes why. The kitchen
 * still gets it as "do not serve", with the note on the ticket; the note is in the audit trail.
 */
function ConfirmDoNotServe({
  dish,
  onCancel,
  onConfirm,
}: {
  dish: MenuDish;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => field.current?.focus(), []);
  const ok = note.trim().length > 0;
  return (
    <div
      className="fixed inset-0 z-50 grid items-end bg-black/40 p-3 sm:place-items-center"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <form
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dns-title"
        aria-describedby="dns-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onConfirm(note.trim());
        }}
        className="grid w-full max-w-md gap-3 rounded-[22px] bg-card p-5 shadow-xl"
      >
        <OutcomeBadge outcome="DO_NOT_SERVE" />
        <h2 id="dns-title" className="text-[20px] leading-tight font-bold">
          {t('tables:confirmStop.title', { dish: dish.name })}
        </h2>
        <p id="dns-body" className="text-[14.5px] text-soft">
          {t('tables:confirmStop.body')}
        </p>
        <label className="grid gap-1.5 text-[14px] font-semibold">
          {t('tables:confirmStop.note')}
          <textarea
            ref={field}
            required
            maxLength={300}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('tables:confirmStop.placeholder')}
            className="rounded-xl border border-line bg-bg px-3 py-2 text-base font-normal"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="press min-h-11 rounded-full bg-mist px-4 text-[15px] font-semibold"
          >
            {t('tables:confirmStop.cancel')}
          </button>
          <button
            type="submit"
            disabled={!ok}
            className="press min-h-11 rounded-full bg-red px-4 text-[15px] font-semibold text-white disabled:opacity-40"
          >
            {t('tables:confirmStop.confirm')}
          </button>
        </div>
      </form>
    </div>
  );
}

type Inner = Omit<Props, 'title'> & { groupOf: (d: MenuDish) => string };

/** Groups in menu order: by course first, then as the dishes come. */
function groups(dishes: MenuDish[], groupOf: (d: MenuDish) => string) {
  const map = new Map<string, MenuDish[]>();
  for (const d of [...dishes].sort((a, b) => a.course - b.course)) {
    const g = groupOf(d);
    map.set(g, [...(map.get(g) ?? []), d]);
  }
  return [...map.entries()];
}

function DishList({ dishes, judged, verdictOf, groupOf, onOrder }: Inner) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [hideStop, setHideStop] = useState(false);
  const all = useMemo(() => groups(dishes, groupOf), [dishes, groupOf]);
  const q = normalizeLabel(query);
  const shown = all
    .filter(([g]) => !group || g === group)
    .map(
      ([g, list]) =>
        [
          g,
          list.filter(
            (d) =>
              (!q || normalizeLabel(`${d.name} ${d.subcategory ?? ''}`).includes(q)) &&
              (!hideStop || !judged || verdictOf(d.id).outcome !== 'DO_NOT_SERVE'),
          ),
        ] as const,
    )
    .filter(([, list]) => list.length > 0);
  const chip = (active: boolean) =>
    `min-h-9 shrink-0 rounded-full px-3.5 text-[14px] font-medium whitespace-nowrap ${
      active ? 'bg-ink text-bg' : 'bg-card text-ink'
    }`;

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('tables:pick.search')}
        aria-label={t('tables:pick.search')}
        className="mb-2 min-h-11 w-full rounded-full border border-line bg-card px-4 text-base"
      />
      <div role="group" aria-label={t('tables:pick.filter')} className="scroll-x mb-2 flex gap-1.5">
        <button
          type="button"
          aria-pressed={group === null}
          onClick={() => setGroup(null)}
          className={chip(group === null)}
        >
          {t('tables:pick.all')}
        </button>
        {all.map(([g]) => (
          <button
            key={g}
            type="button"
            aria-pressed={group === g}
            onClick={() => setGroup(group === g ? null : g)}
            className={chip(group === g)}
          >
            {g}
          </button>
        ))}
        {judged && (
          <button
            type="button"
            aria-pressed={hideStop}
            onClick={() => setHideStop(!hideStop)}
            className={chip(hideStop)}
          >
            {t('tables:pick.hideStop')}
          </button>
        )}
      </div>
      <section className="rounded-[18px] bg-card px-3.5 py-1">
        {shown.length === 0 && <p className="py-3 text-sm text-soft">{t('tables:pick.none')}</p>}
        {shown.map(([g, list]) => (
          <div key={g}>
            <h3 className="pt-3 text-[12px] font-semibold tracking-wide text-soft uppercase">
              {g}
            </h3>
            {list.map((dish) => {
              const result = verdictOf(dish.id);
              return (
                <div
                  key={dish.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 border-b border-line py-3 last:border-b-0"
                >
                  <span className="grid min-w-0 justify-items-start gap-1">
                    <span className="break-words">
                      <b className="text-[15px] font-semibold">{dish.name}</b>
                      {dish.subcategory && (
                        <span className="ml-1.5 text-[12.5px] text-soft">{dish.subcategory}</span>
                      )}
                    </span>
                    {judged && <OutcomeBadge outcome={result.outcome} />}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOrder(dish)}
                    aria-label={t('tables:orderDish', { dish: dish.name })}
                    className="press inline-flex min-h-9 items-center gap-1 rounded-full bg-brand px-3 text-[13px] font-semibold text-white"
                  >
                    <Plus width={14} height={14} />
                    {t('tables:order')}
                  </button>
                  {judged && <AssessmentDetails result={result} />}
                </div>
              );
            })}
          </div>
        ))}
      </section>
    </>
  );
}

const TONE: Partial<Record<Assessment['outcome'], string>> = {
  DO_NOT_SERVE: 'border-[var(--pg-out-stop)]',
  UNKNOWN: 'border-[var(--pg-out-unknown)]',
  CAUTION: 'border-[var(--pg-out-warn)]',
  ADAPTABLE: 'border-[var(--pg-out-adjust)]',
};

function DishGrid({
  dishes,
  judged,
  verdictOf,
  groupOf,
  onOrder,
  added,
}: Inner & { added: string | null }) {
  const { t } = useTranslation();
  const [path, setPath] = useState<[string?, string?]>([]);
  const all = useMemo(() => groups(dishes, groupOf), [dishes, groupOf]);
  const [group, sub] = path;
  const inGroup = all.find(([g]) => g === group)?.[1] ?? [];
  const subs = [...new Set(inGroup.flatMap((d) => (d.subcategory ? [d.subcategory] : [])))];
  const tile =
    'press grid min-h-[88px] content-between gap-1.5 rounded-2xl border-2 p-3 text-left shadow-sm';

  const crumbs = (
    <nav aria-label={t('tables:pick.path')} className="mb-2 flex flex-wrap items-center gap-1">
      {group && (
        <button
          type="button"
          onClick={() => setPath(sub ? [group] : [])}
          className="inline-flex min-h-9 items-center gap-0.5 pr-2 text-[14px] font-semibold text-brand-ink"
        >
          <ChevronLeft width={18} height={18} />
          {sub ? group : t('tables:pick.categories')}
        </button>
      )}
      <span className="text-[14px] font-semibold">
        {sub ?? group ?? t('tables:pick.categories')}
      </span>
    </nav>
  );

  const dishTile = (d: MenuDish) => {
    const result = verdictOf(d.id);
    return (
      <button
        key={d.id}
        type="button"
        onClick={() => onOrder(d)}
        aria-label={t('tables:orderDish', { dish: d.name })}
        className={`${tile} bg-card ${judged ? (TONE[result.outcome] ?? 'border-transparent') : 'border-transparent'}`}
      >
        <b className="text-[15px] leading-snug font-semibold">{d.name}</b>
        {judged && <OutcomeBadge outcome={result.outcome} />}
      </button>
    );
  };
  const folder = (name: string, count: number, onClick: () => void) => (
    <button
      key={name}
      type="button"
      onClick={onClick}
      className={`${tile} border-transparent bg-brand-soft`}
    >
      <b className="text-[16px] leading-snug font-semibold text-brand-ink">{name}</b>
      <span className="text-[12.5px] text-soft">{t('tables:pick.dishCount', { count })}</span>
    </button>
  );

  let body;
  if (!group) {
    body = all.map(([g, list]) => folder(g, list.length, () => setPath([g])));
  } else if (!sub && subs.length > 0) {
    body = [
      ...subs.map((s) =>
        folder(s, inGroup.filter((d) => d.subcategory === s).length, () => setPath([group, s])),
      ),
      ...inGroup.filter((d) => !d.subcategory).map(dishTile),
    ];
  } else {
    body = inGroup.filter((d) => !sub || d.subcategory === sub).map(dishTile);
  }

  return (
    <section className="rounded-[18px] bg-card/60 p-0.5">
      {crumbs}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{body}</div>
      {added && group && (
        <p aria-hidden="true" className="mt-2 text-[13px] font-medium text-soft">
          {t('tables:pick.added', { dish: added })}
        </p>
      )}
    </section>
  );
}
