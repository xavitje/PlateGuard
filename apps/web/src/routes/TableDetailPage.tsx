import {
  assess,
  normalizeLabel,
  searchIngredients,
  type GuestAllergy,
  type Severity,
} from '@plateguard/domain';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { AssessmentDetails } from '../components/AssessmentDetails';
import { DishPicker } from '../components/DishPicker';
import { ChevronLeft, Plus } from '../components/icons';
import { IncidentReport } from '../components/IncidentReport';
import { OutcomeBadge } from '../components/OutcomeBadge';
import { SeveritySegment } from '../components/SeveritySegment';
import { ALLERGEN_NAMES, QUICK_ALLERGENS } from '../allergens';
import { useMenu, useTable, useTableWrite } from '../service/ServiceProvider';

const keyOf = (a: GuestAllergy) =>
  a.custom !== undefined
    ? `custom:${normalizeLabel(a.custom)}`
    : a.ingredient !== undefined
      ? `ingredient:${a.ingredient.id}`
      : a.allergen;

/**
 * One table: seats, the allergies per seat (each with its own severity), and the menu judged live
 * by the same engine the server uses. Under "Other allergy" the waiter types and picks one of the
 * restaurant's ingredients (checked against the recipes), or keeps their own text (checked by hand).
 *
 * The menu shows each dish's outcome as guidance while taking the order. Only what is ordered
 * for a seat raises an alert, so the Alerts tab stays quiet until it matters.
 */
export function TableDetailPage() {
  const { label = '' } = useParams();
  const { t, i18n } = useTranslation();
  const tableQuery = useTable(label);
  const menu = useMenu();
  const write = useTableWrite(label);
  const table = tableQuery.data;
  const seats = table?.seats ?? 4;
  const [params] = useSearchParams();
  const [seatChoice, setSeat] = useState(() => {
    const s = Number(params.get('seat'));
    return Number.isInteger(s) && s >= 1 ? s : 1;
  });
  const seat = Math.min(seatChoice, seats);
  const seatOf = (n: number) => table?.bySeat.find((s) => s.seat === n);
  const seatState = seatOf(seat) ?? { allergies: [], noAllergy: false, orders: [] };
  const current = seatState.allergies;
  const dishes = menu.data?.dishes ?? [];
  const ingredients = menu.data?.ingredients;
  const [customText, setCustomText] = useState('');
  const lang = i18n.language === 'nl' ? 'nl' : 'en';

  const nameOf = (a: GuestAllergy) =>
    a.custom !== undefined
      ? a.custom
      : a.ingredient !== undefined
        ? a.ingredient.name
        : (ALLERGEN_NAMES[a.allergen]?.[lang] ?? a.allergen);

  const update = (next: GuestAllergy[]) =>
    write.mutate({ kind: 'seat', seat, body: { allergies: next, noAllergy: false } });
  const add = (a: GuestAllergy) => {
    if (current.some((c) => keyOf(c) === keyOf(a))) return;
    update([...current, a]);
  };
  const setSeverity = (key: string, severity: Severity) =>
    update(current.map((c) => (keyOf(c) === key ? { ...c, severity } : c)));
  const remove = (key: string) => update(current.filter((c) => keyOf(c) !== key));

  const typed = customText.trim();
  const suggestions = useMemo(
    () => searchIngredients(customText, ingredients ?? [], 6),
    [customText, ingredients],
  );
  // An exact match is the same thing as the typed text, so Enter picks the ingredient.
  const exact = suggestions.find((m) => m.score === 3);

  const pickIngredient = (id: string, name: string) => {
    add({ ingredient: { id, name }, severity: 'SEVERE' });
    setCustomText('');
  };
  const addTyped = () => {
    if (!typed) return;
    add({ custom: typed, severity: 'SEVERE' });
    setCustomText('');
  };
  const submitOther = (e: FormEvent) => {
    e.preventDefault();
    if (exact) pickIngredient(exact.id, exact.name);
    else addTyped();
  };

  const verdicts = dishes.map((dish) => ({ dish, result: assess({ dish, guest: current }) }));
  const ordered = seatState.orders.flatMap((line) => {
    const dish = dishes.find((d) => d.id === line.dishId);
    return dish
      ? [{ line, dish, result: assess({ dish, guest: current, choices: line.choices }) }]
      : [];
  });

  return (
    <>
      <Link
        to="/tables"
        className="inline-flex min-h-10 items-center gap-0.5 px-1 font-medium text-brand-ink no-underline"
      >
        <ChevronLeft width={20} height={20} />
        {t('tables:title')}
      </Link>
      <h1 className="mx-1 mt-1 mb-3 text-[28px] font-semibold tracking-[-0.03em] lg:text-[30px]">
        {t('tables:table', { label })}
      </h1>
      {(tableQuery.isError || menu.isError) && (
        <p role="alert" className="mx-1.5 mb-3 text-sm text-red">
          {t('common:loadError')}
        </p>
      )}
      {write.isError && (
        <p role="alert" className="mx-1.5 mb-3 text-sm text-red">
          {t('common:saveError')}
        </p>
      )}
      {(!table || !menu.data) && !tableQuery.isError && !menu.isError && (
        <p className="mx-1.5 text-sm text-soft">{t('common:loading')}</p>
      )}
      {table && menu.data && (
        <>
          <div role="tablist" className="scroll-x mb-4 flex gap-1 rounded-[13px] bg-line/60 p-1">
            {Array.from({ length: seats }, (_, i) => i + 1).map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={seat === s}
                onClick={() => setSeat(s)}
                className={`grid min-h-12 min-w-11 flex-1 shrink-0 rounded-[11px] py-1 text-xs transition-colors duration-150 ${seat === s ? 'bg-raised shadow-sm' : 'text-soft'}`}
              >
                <b
                  className={`text-base font-semibold ${seat === s ? 'text-brand-ink' : 'text-ink'}`}
                >
                  {s}
                </b>
                {(seatOf(s)?.allergies.length ?? 0) > 0 && (
                  <i className={`mx-auto mt-0.5 block size-1.5 rounded-full bg-brand`} />
                )}
              </button>
            ))}
          </div>

          <section className="mb-3 rounded-[18px] bg-card px-3.5 py-1">
            {current.length === 0 && (
              <div className="flex items-center justify-between gap-3 py-3">
                <p className="text-sm text-soft">{t('tables:askAllergies')}</p>
                <button
                  type="button"
                  aria-pressed={seatState.noAllergy}
                  onClick={() =>
                    write.mutate({
                      kind: 'seat',
                      seat,
                      body: { allergies: current, noAllergy: !seatState.noAllergy },
                    })
                  }
                  className={`press min-h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold ${seatState.noAllergy ? 'bg-brand-soft text-brand-ink' : 'bg-mist'}`}
                >
                  {t('tables:noAllergy')}
                </button>
              </div>
            )}
            {current.map((a) => {
              const key = keyOf(a);
              return (
                <div key={key} className="grid gap-2 border-b border-line py-3 last:border-b-0">
                  <div className="flex items-center justify-between">
                    <b className="font-semibold">{nameOf(a)}</b>
                    <button
                      type="button"
                      onClick={() => remove(key)}
                      aria-label={`${nameOf(a)} ×`}
                      className="relative grid size-7 place-items-center rounded-full bg-mist text-soft after:absolute after:-inset-2 after:content-['']"
                    >
                      ×
                    </button>
                  </div>
                  <SeveritySegment
                    value={a.severity ?? 'SEVERE'}
                    onChange={(s) => setSeverity(key, s)}
                    label={nameOf(a)}
                  />
                  {a.custom !== undefined && (
                    <span className="text-[12.5px] text-soft">{t('tables:customHint')}</span>
                  )}
                  {a.ingredient !== undefined && (
                    <span className="text-[12.5px] text-soft">
                      {a.severity === 'SEVERE'
                        ? t('tables:ingredientHintSevere')
                        : t('tables:ingredientHint')}
                    </span>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap gap-1.5 pt-2.5 pb-3">
              {QUICK_ALLERGENS.filter((code) => !current.some((c) => c.allergen === code)).map(
                (code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => add({ allergen: code, severity: 'SEVERE' })}
                    className="press min-h-9 rounded-full bg-mist px-3 text-[13px] font-medium"
                  >
                    + {ALLERGEN_NAMES[code]?.[lang] ?? code}
                  </button>
                ),
              )}
            </div>
            <form onSubmit={submitOther} className="pb-3">
              <div className="flex gap-2">
                <label className="sr-only" htmlFor="custom-allergy">
                  {t('tables:addCustom')}
                </label>
                <input
                  id="custom-allergy"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder={t('tables:customPlaceholder')}
                  maxLength={60}
                  autoComplete="off"
                  autoCorrect="off"
                  enterKeyHint="done"
                  role="combobox"
                  aria-expanded={typed.length > 0}
                  aria-controls="ingredient-suggestions"
                  className="min-h-11 min-w-0 flex-1 rounded-full border border-line bg-bg px-3.5 text-base"
                />
                {!typed && (
                  <span className="inline-flex min-h-10 items-center gap-1 rounded-full bg-mist px-3.5 text-[13px] font-semibold text-soft">
                    <Plus width={16} height={16} />
                    {t('tables:addCustom')}
                  </span>
                )}
              </div>
              {typed && (
                <ul
                  id="ingredient-suggestions"
                  aria-label={t('tables:suggestions')}
                  className="mt-2 grid gap-1 rounded-[14px] border border-line bg-bg p-1"
                >
                  {suggestions.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => pickIngredient(m.id, m.name)}
                        className="press flex min-h-10 w-full items-center justify-between gap-2 rounded-[10px] px-3 text-left text-sm hover:bg-mist active:bg-mist"
                      >
                        <span>
                          <b className="font-semibold">{m.name}</b>
                          {m.matched !== m.name && (
                            <span className="text-soft"> · {m.matched}</span>
                          )}
                        </span>
                        <span className="text-[12px] text-soft">{t('tables:inRecipes')}</span>
                      </button>
                    </li>
                  ))}
                  {!exact && (
                    <li>
                      <button
                        type="button"
                        onClick={addTyped}
                        className="press flex min-h-10 w-full items-center gap-1.5 rounded-[10px] px-3 text-left text-sm hover:bg-mist active:bg-mist"
                      >
                        <Plus width={16} height={16} />
                        {t('tables:useTyped', { text: typed })}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </form>
            <p className="pb-3 text-[12.5px] text-soft">{t('tables:addAllergenHint')}</p>
          </section>

          <h2 className="mx-1.5 mt-4 mb-2 text-[13px] font-semibold tracking-normal text-soft">
            {t('tables:orderedForSeat', { seat })}
          </h2>
          <section className="rounded-[18px] bg-card px-3.5 py-1">
            {ordered.length === 0 && (
              <p className="py-3 text-sm text-soft">{t('tables:nothingOrdered')}</p>
            )}
            {ordered.map(({ line, dish, result }) => (
              <div
                key={line.id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2.5 gap-y-0.5 border-b border-line py-3 last:border-b-0"
              >
                <b className="text-[15px] font-semibold">{dish.name}</b>
                {current.length > 0 ? <OutcomeBadge outcome={result.outcome} /> : <span />}
                {line.status === 'ASSESSED' || line.status === 'REJECTED' ? (
                  <button
                    type="button"
                    onClick={() => write.mutate({ kind: 'cancel', plateId: line.id })}
                    aria-label={t('tables:cancelOrder', { dish: dish.name })}
                    className="relative grid size-7 place-items-center rounded-full bg-mist text-soft after:absolute after:-inset-2 after:content-['']"
                  >
                    ×
                  </button>
                ) : (
                  <span />
                )}
                {line.status === 'REJECTED' ? (
                  <p role="alert" className="col-span-3 text-[13px] font-semibold text-red">
                    {t('tables:rejected', { reason: line.rejectReason ?? '' })}
                  </p>
                ) : (
                  line.status !== 'ASSESSED' && (
                    <p className="col-span-3 text-[13px] text-soft">
                      {t(`tables:status.${line.status}`)}
                    </p>
                  )
                )}
                {current.length > 0 && line.status !== 'SERVED' && (
                  <AssessmentDetails result={result} dish={dish} />
                )}
                {line.approved && (
                  <p className="col-span-3 text-[13px] font-semibold">
                    {t('tables:approvedByKitchen', { reason: line.approved })}
                  </p>
                )}
                {line.note && (
                  <p className="col-span-3 text-[13px] text-soft">
                    {t('tables:confirmStop.shown', { note: line.note })}
                  </p>
                )}
              </div>
            ))}
          </section>

          <DishPicker
            title={t('tables:menuForSeat', { seat })}
            dishes={dishes}
            judged={current.length > 0}
            verdictOf={(id) => verdicts.find((v) => v.dish.id === id)!.result}
            guest={current}
            onOrder={(dish, note, choices) =>
              write.mutate({ kind: 'order', seat, dishId: dish.id, note, choices })
            }
          />
          <p className="mx-1.5 mt-2 text-[12.5px] text-soft">{t('tables:menuGuidance')}</p>
          <IncidentReport
            label={label}
            seats={seats}
            seat={seat}
            plates={table.bySeat.flatMap((s) =>
              s.orders.map((o) => ({
                id: o.id,
                seat: s.seat,
                name: dishes.find((d) => d.id === o.dishId)?.name ?? '',
              })),
            )}
          />
        </>
      )}
    </>
  );
}

/** The changes and manual checks for one dish, under its name. */
