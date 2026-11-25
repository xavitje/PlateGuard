import type {
  ComponentDraft,
  ComponentResponse,
  DishDraft,
  DishResponse,
  IngredientDraft,
  IngredientResponse,
} from '@plateguard/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdmin, useAdminSave, useAllergens, useCan } from './hooks';
import {
  AllergenPicker,
  button,
  CheckList,
  Field,
  input,
  MasterDetail,
  primary,
  SaveError,
  Toggle,
} from './ui';
import { PageHeader } from '../shell/TabsLayout';
import { segmentItem, segmentTrack } from '../components/segment';

const TABS = ['ingredients', 'components', 'dishes'] as const;
type Tab = (typeof TABS)[number];

/** The recipe database: ingredients, the components made from them, and the dishes. */
export function RecipesPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('ingredients');
  return (
    <>
      <PageHeader title={t('admin:nav.recipes')} description={t('admin:recipes.intro')} />
      <div role="tablist" className={`${segmentTrack} mb-5 sm:w-fit`}>
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={segmentItem(tab === k)}
          >
            {t(`admin:recipes.tabs.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'ingredients' && <Ingredients />}
      {tab === 'components' && <Components />}
      {tab === 'dishes' && <Dishes />}
    </>
  );
}

const csv = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function Ingredients() {
  const { t } = useTranslation();
  const rows = useAdmin('ingredients').data ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const current = rows.find((r) => r.id === selected);
  return (
    <MasterDetail
      items={rows.map((r) => ({
        id: r.id,
        name: r.name,
        meta: !r.verifiedAt && (
          <span className="rounded-full bg-amber/15 px-2 text-[12px] font-semibold text-amber">
            {t('admin:ingredients.unverified')}
          </span>
        ),
      }))}
      selected={selected}
      onSelect={setSelected}
      onNew={() => setSelected('new')}
      newLabel={t('admin:ingredients.new')}
      detail={
        selected ? (
          <IngredientForm key={selected} row={current} onSaved={(r) => setSelected(r.id)} />
        ) : (
          <p className="text-soft">{t('admin:pick')}</p>
        )
      }
    />
  );
}

function IngredientForm({
  row,
  onSaved,
}: {
  row?: IngredientResponse;
  onSaved: (r: IngredientResponse) => void;
}) {
  const { t } = useTranslation();
  const can = useCan();
  const allergens = useAllergens().data ?? [];
  const [name, setName] = useState(row?.name ?? '');
  const [synonyms, setSynonyms] = useState(row?.synonyms.join(', ') ?? '');
  const [contains, setContains] = useState(row?.contains ?? []);
  const [mayContain, setMayContain] = useState(row?.mayContain ?? []);
  const [supplier, setSupplier] = useState(row?.supplier ?? '');
  const [brand, setBrand] = useState(row?.brand ?? '');
  const [articleNumber, setArticleNumber] = useState(row?.articleNumber ?? '');
  const [verified, setVerified] = useState(!!row?.verifiedAt);
  const save = useAdminSave((c, l, id: string | null, body: IngredientDraft) =>
    c.saveIngredient(l, id, body),
  );
  const changedAllergens =
    !!row &&
    (row.contains.join() !== contains.join() || row.mayContain.join() !== mayContain.join());
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          [
            row?.id ?? null,
            {
              name,
              synonyms: csv(synonyms),
              contains,
              mayContain,
              supplier: supplier || null,
              brand: brand || null,
              articleNumber: articleNumber || null,
              verified,
            },
          ],
          { onSuccess: onSaved },
        );
      }}
    >
      <h2 className="text-xl font-semibold">{row?.name ?? t('admin:ingredients.new')}</h2>
      {row && row.usedIn > 0 && (
        <p className="text-[13.5px] text-soft">
          {t('admin:ingredients.usedIn', { count: row.usedIn })}
        </p>
      )}
      <Field label={t('admin:fields.name')}>
        <input className={input} required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t('admin:ingredients.synonyms')} hint={t('admin:ingredients.synonymsHint')}>
        <input className={input} value={synonyms} onChange={(e) => setSynonyms(e.target.value)} />
      </Field>
      <AllergenPicker
        label={t('admin:ingredients.contains')}
        allergens={allergens}
        value={contains}
        onChange={setContains}
      />
      <AllergenPicker
        label={t('admin:ingredients.mayContain')}
        allergens={allergens}
        value={mayContain}
        onChange={setMayContain}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('admin:ingredients.supplier')}>
          <input className={input} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </Field>
        <Field label={t('admin:ingredients.brand')}>
          <input className={input} value={brand} onChange={(e) => setBrand(e.target.value)} />
        </Field>
        <Field label={t('admin:ingredients.articleNumber')}>
          <input
            className={input}
            value={articleNumber}
            onChange={(e) => setArticleNumber(e.target.value)}
          />
        </Field>
      </div>
      <Toggle
        label={t('admin:ingredients.verified')}
        hint={
          can('ingredient.verify')
            ? t('admin:ingredients.verifiedHint')
            : t('admin:ingredients.verifyNotAllowed')
        }
        checked={verified}
        disabled={!can('ingredient.verify')}
        onChange={setVerified}
      />
      {changedAllergens && verified && row?.verifiedAt && (
        <p className="text-[13.5px] text-soft">{t('admin:ingredients.reverify')}</p>
      )}
      <SaveError error={save.error} />
      <div>
        <button className={primary} disabled={save.isPending}>
          {t('admin:save')}
        </button>
      </div>
    </form>
  );
}

function Components() {
  const { t } = useTranslation();
  const rows = useAdmin('components').data ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <MasterDetail
      items={rows}
      selected={selected}
      onSelect={setSelected}
      onNew={() => setSelected('new')}
      newLabel={t('admin:components.new')}
      detail={
        selected ? (
          <ComponentForm
            key={selected}
            row={rows.find((r) => r.id === selected)}
            all={rows}
            onSaved={(r) => setSelected(r.id)}
          />
        ) : (
          <p className="text-soft">{t('admin:pick')}</p>
        )
      }
    />
  );
}

function ComponentForm({
  row,
  all,
  onSaved,
}: {
  row?: ComponentResponse;
  all: ComponentResponse[];
  onSaved: (r: ComponentResponse) => void;
}) {
  const { t } = useTranslation();
  const ingredients = useAdmin('ingredients').data ?? [];
  const equipment = useAdmin('equipment').data ?? [];
  const [name, setName] = useState(row?.name ?? '');
  const [nameNl, setNameNl] = useState(row?.nameNl ?? '');
  const [omittable, setOmittable] = useState(row?.omittable ?? false);
  const [premixed, setPremixed] = useState(row?.premixed ?? false);
  const [suitableForSevere, setSuitable] = useState(row?.suitableForSevere ?? false);
  const [ingredientIds, setIngredientIds] = useState(row?.ingredientIds ?? []);
  const [equipmentIds, setEquipmentIds] = useState(row?.equipmentIds ?? []);
  const [childIds, setChildIds] = useState(row?.childIds ?? []);
  const [subs, setSubs] = useState(row?.substitutions ?? []);
  const others = all.filter((c) => c.id !== row?.id);
  const save = useAdminSave((c, l, id: string | null, body: ComponentDraft) =>
    c.saveComponent(l, id, body),
  );
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          [
            row?.id ?? null,
            {
              name,
              nameNl: nameNl || null,
              omittable,
              premixed,
              suitableForSevere,
              ingredientIds,
              equipmentIds,
              childIds,
              substitutions: subs,
            },
          ],
          { onSuccess: onSaved },
        );
      }}
    >
      <h2 className="text-xl font-semibold">{row?.name ?? t('admin:components.new')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('admin:fields.name')}>
          <input
            className={input}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t('admin:fields.nameNl')}>
          <input className={input} value={nameNl} onChange={(e) => setNameNl(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-2">
        <Toggle
          label={t('admin:components.omittable')}
          hint={t('admin:components.omittableHint')}
          checked={omittable}
          onChange={setOmittable}
        />
        <Toggle
          label={t('admin:components.premixed')}
          hint={t('admin:components.premixedHint')}
          checked={premixed}
          onChange={setPremixed}
        />
        <Toggle
          label={t('admin:components.suitableForSevere')}
          hint={t('admin:components.suitableForSevereHint')}
          checked={suitableForSevere}
          onChange={setSuitable}
        />
      </div>
      <CheckList
        label={t('admin:components.ingredients')}
        items={ingredients}
        value={ingredientIds}
        onChange={setIngredientIds}
      />
      <CheckList
        label={t('admin:components.children')}
        items={others}
        value={childIds}
        onChange={setChildIds}
      />
      <CheckList
        label={t('admin:components.substitutes')}
        items={others}
        value={subs.map((s) => s.replacementId)}
        onChange={(ids) =>
          setSubs(
            ids.map(
              (id) =>
                subs.find((s) => s.replacementId === id) ?? {
                  replacementId: id,
                  suitableForSevere: false,
                },
            ),
          )
        }
        extra={(c) => (
          <Toggle
            label={t('admin:components.substituteSevere')}
            checked={subs.find((s) => s.replacementId === c.id)?.suitableForSevere ?? false}
            onChange={(on) =>
              setSubs(
                subs.map((s) => (s.replacementId === c.id ? { ...s, suitableForSevere: on } : s)),
              )
            }
          />
        )}
      />
      <CheckList
        label={t('admin:components.equipment')}
        items={equipment}
        value={equipmentIds}
        onChange={setEquipmentIds}
      />
      <SaveError error={save.error} />
      <div>
        <button className={primary} disabled={save.isPending}>
          {t('admin:save')}
        </button>
      </div>
    </form>
  );
}

function Dishes() {
  const { t } = useTranslation();
  const rows = useAdmin('dishes').data ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <MasterDetail
      items={rows}
      selected={selected}
      onSelect={setSelected}
      onNew={() => setSelected('new')}
      newLabel={t('admin:dishes.new')}
      detail={
        selected ? (
          <DishForm
            key={selected}
            row={rows.find((r) => r.id === selected)}
            onSaved={(r) => setSelected(r.id)}
          />
        ) : (
          <p className="text-soft">{t('admin:pick')}</p>
        )
      }
    />
  );
}

function DishForm({ row, onSaved }: { row?: DishResponse; onSaved: (r: DishResponse) => void }) {
  const { t } = useTranslation();
  const components = useAdmin('components').data ?? [];
  const [name, setName] = useState(row?.name ?? '');
  const [nameNl, setNameNl] = useState(row?.nameNl ?? '');
  const [course, setCourse] = useState(row?.course ?? 1);
  const [category, setCategory] = useState(row?.category ?? '');
  const [subcategory, setSubcategory] = useState(row?.subcategory ?? '');
  // Earlier choices, so the same category is not typed two ways.
  const known = useAdmin('dishes').data ?? [];
  const categories = [...new Set(known.flatMap((d) => (d.category ? [d.category] : [])))];
  const subcategories = [
    ...new Set(
      known.flatMap((d) => (d.category === category && d.subcategory ? [d.subcategory] : [])),
    ),
  ];
  const [price, setPrice] = useState(
    row?.priceCents != null ? (row.priceCents / 100).toFixed(2) : '',
  );
  const [parts, setParts] = useState(row?.componentIds ?? []);
  const [adding, setAdding] = useState('');
  const save = useAdminSave((c, l, id: string | null, body: DishDraft) => c.saveDish(l, id, body));
  const nameOf = (id: string) => components.find((c) => c.id === id)?.name ?? id;
  const move = (i: number, by: number) => {
    const next = [...parts];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    setParts(next);
  };
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const cents = price.trim() ? Math.round(Number(price.replace(',', '.')) * 100) : null;
        save.mutate(
          [
            row?.id ?? null,
            {
              name,
              nameNl: nameNl || null,
              course,
              category: category.trim() || null,
              subcategory: subcategory.trim() || null,
              priceCents: Number.isFinite(cents) ? cents : null,
              componentIds: parts,
            },
          ],
          { onSuccess: onSaved },
        );
      }}
    >
      <h2 className="text-xl font-semibold">{row?.name ?? t('admin:dishes.new')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('admin:fields.name')}>
          <input
            className={input}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t('admin:fields.nameNl')}>
          <input className={input} value={nameNl} onChange={(e) => setNameNl(e.target.value)} />
        </Field>
        <Field label={t('admin:dishes.course')}>
          <input
            className={input}
            type="number"
            min={0}
            max={9}
            value={course}
            onChange={(e) => setCourse(Number(e.target.value))}
          />
        </Field>
        <Field label={t('admin:dishes.category')}>
          <input
            className={input}
            list="dish-categories"
            placeholder={t('admin:dishes.categoryHint')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id="dish-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label={t('admin:dishes.subcategory')}>
          <input
            className={input}
            list="dish-subcategories"
            placeholder={t('admin:dishes.subcategoryHint')}
            disabled={!category.trim()}
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
          />
          <datalist id="dish-subcategories">
            {subcategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label={t('admin:dishes.price')}>
          <input
            className={input}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13.5px] font-medium text-soft">
          {t('admin:dishes.components')}
        </legend>
        <ol className="grid gap-1.5">
          {parts.map((id, i) => (
            <li
              key={id}
              className="flex items-center justify-between gap-2 rounded-[10px] border border-line px-3 py-1.5"
            >
              <span className="min-w-0">{nameOf(id)}</span>
              <span className="flex gap-1">
                <button
                  type="button"
                  className={button}
                  disabled={i === 0}
                  aria-label={t('admin:moveUp', { name: nameOf(id) })}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={button}
                  aria-label={t('admin:remove', { name: nameOf(id) })}
                  onClick={() => setParts(parts.filter((p) => p !== id))}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ol>
        <div className="flex gap-2">
          <select
            className={input}
            aria-label={t('admin:dishes.addComponent')}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          >
            <option value="">{t('admin:dishes.addComponent')}</option>
            {components
              .filter((c) => !parts.includes(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            className={button}
            disabled={!adding}
            onClick={() => {
              setParts([...parts, adding]);
              setAdding('');
            }}
          >
            {t('admin:add')}
          </button>
        </div>
      </fieldset>
      <SaveError error={save.error} />
      <div>
        <button className={primary} disabled={save.isPending || parts.length === 0}>
          {t('admin:save')}
        </button>
      </div>
    </form>
  );
}
