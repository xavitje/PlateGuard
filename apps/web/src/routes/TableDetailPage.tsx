import {
  assess,
  normalizeLabel,
  searchIngredients,
  type Assessment,
  type GuestAllergy,
  type Severity,
} from '@plateguard/domain';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { ChevronLeft, Plus } from '../components/icons';
import { OutcomeBadge } from '../components/OutcomeBadge';
import { SeveritySegment } from '../components/SeveritySegment';
import { useService } from '../service/ServiceProvider';
import {
  DEMO_ALLERGEN_NAMES,
  DEMO_DISHES,
  DEMO_INGREDIENTS,
  DEMO_TABLES,
  QUICK_ALLERGENS,
} from '../demo';

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
  const table = DEMO_TABLES.find((tb) => tb.label === label);
  const seats = table?.seats ?? 4;
  const [params] = useSearchParams();
  const [seat, setSeat] = useState(() => {
    const s = Number(params.get('seat'));
    return s >= 1 && s <= seats ? s : 1;
  });
  const service = useService();
  const seatState = service.seat(label, seat);
  const current = seatState.allergies;
  const [customText, setCustomText] = useState('');
  const lang = i18n.language === 'nl' ? 'nl' : 'en';

  const nameOf = (a: GuestAllergy) =>
    a.custom !== undefined
      ? a.custom
      : a.ingredient !== undefined
        ? a.ingredient.name
        : (DEMO_ALLERGEN_NAMES[a.allergen]?.[lang] ?? a.allergen);

  const update = (next: GuestAllergy[]) => service.setAllergies(label, seat, next);
  const add = (a: GuestAllergy) => {
    if (current.some((c) => keyOf(c) === keyOf(a))) return;
    update([...current, a]);
  };
  const setSeverity = (key: string, severity: Severity) =>
    update(current.map((c) => (keyOf(c) === key ? { ...c, severity } : c)));
  const remove = (key: string) => update(current.filter((c) => keyOf(c) !== key));

  const typed = customText.trim();
  const suggestions = useMemo(
    () => searchIngredients(customText, DEMO_INGREDIENTS, 6),
    [customText],
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

  const verdicts = DEMO_DISHES.map((dish) => ({ dish, result: assess({ dish, guest: current }) }));
  const ordered = seatState.orders.flatMap((line) => {
    const v = verdicts.find((x) => x.dish.id === line.dishId);
    return v ? [{ line, ...v }] : [];
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
      <h1 className="mx-1 mt-1 mb-3 text-[32px] font-bold tracking-[-0.035em]">
        {t('tables:table', { label })}
      </h1>

      <div
        role="tablist"
        className="mb-3 flex gap-1.5 rounded-[14px] bg-[#e9ebef] p-1 dark:bg-card"
      >
        {Array.from({ length: seats }, (_, i) => i + 1).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={seat === s}
            onClick={() => setSeat(s)}
            className={`grid min-h-12 flex-1 rounded-[11px] py-1 text-xs ${seat === s ? 'bg-card shadow-sm' : 'text-soft'}`}
          >
            <b className="text-base font-semibold text-ink">{s}</b>
            {service.seat(label, s).allergies.length > 0 && (
              <i className="mx-auto mt-0.5 block size-1.5 rounded-full bg-brand" />
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
              onClick={() => service.toggleNoAllergy(label, seat)}
              className={`press min-h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold ${seatState.noAllergy ? 'bg-brand text-white' : 'bg-mist'}`}
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
                  className="grid size-7 place-items-center rounded-full bg-mist text-soft"
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
                className="press min-h-8 rounded-full bg-mist px-3 text-[13px] font-medium"
              >
                + {DEMO_ALLERGEN_NAMES[code]?.[lang] ?? code}
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
              role="combobox"
              aria-expanded={typed.length > 0}
              aria-controls="ingredient-suggestions"
              className="min-h-10 min-w-0 flex-1 rounded-full border border-line bg-bg px-3.5 text-sm"
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
                    className="press flex min-h-10 w-full items-center justify-between gap-2 rounded-[10px] px-3 text-left text-sm hover:bg-mist"
                  >
                    <span>
                      <b className="font-semibold">{m.name}</b>
                      {m.matched !== m.name && <span className="text-soft"> · {m.matched}</span>}
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
                    className="press flex min-h-10 w-full items-center gap-1.5 rounded-[10px] px-3 text-left text-sm hover:bg-mist"
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
            <button
              type="button"
              onClick={() => service.cancelOrder(label, seat, line.id)}
              aria-label={t('tables:cancelOrder', { dish: dish.name })}
              className="grid size-7 place-items-center rounded-full bg-mist text-soft"
            >
              ×
            </button>
            {current.length > 0 && <Details result={result} />}
          </div>
        ))}
      </section>

      <h2 className="mx-1.5 mt-4 mb-2 text-[13px] font-semibold tracking-normal text-soft">
        {t('tables:menuForSeat', { seat })}
      </h2>
      <section className="rounded-[18px] bg-card px-3.5 py-1">
        {verdicts.map(({ dish, result }) => (
          <div
            key={dish.id}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2.5 gap-y-0.5 border-b border-line py-3 last:border-b-0"
          >
            <b className="text-[15px] font-semibold">{dish.name}</b>
            {current.length > 0 ? <OutcomeBadge outcome={result.outcome} /> : <span />}
            <button
              type="button"
              onClick={() => service.order(label, seat, dish.id)}
              aria-label={t('tables:orderDish', { dish: dish.name })}
              className="press inline-flex min-h-8 items-center gap-1 rounded-full bg-brand px-3 text-[13px] font-semibold text-white"
            >
              <Plus width={14} height={14} />
              {t('tables:order')}
            </button>
            {current.length > 0 && <Details result={result} />}
          </div>
        ))}
      </section>
      <p className="mx-1.5 mt-2 text-[12.5px] text-soft">{t('tables:menuGuidance')}</p>
    </>
  );
}

/** The changes and manual checks for one dish, under its name. */
function Details({ result }: { result: Assessment }) {
  const { t } = useTranslation();
  return (
    <>
      {result.modifications.length > 0 && (
        <span className="col-span-3 text-[12.5px] text-soft">
          {result.modifications
            .map((m) =>
              m.action === 'SUBSTITUTE'
                ? `${m.componentName} → ${m.substitute?.name}`
                : `− ${m.componentName}`,
            )
            .join(' · ')}
        </span>
      )}
      {result.manualChecks.length > 0 && (
        <span className="col-span-3 text-[12.5px] text-soft">
          {result.manualChecks
            .map((m) =>
              m.kind === 'CUSTOM'
                ? t('kitchen:manualCheck', { label: m.label })
                : t('kitchen:manualCheckTraces', { label: m.label }),
            )
            .join(' · ')}
        </span>
      )}
    </>
  );
}
