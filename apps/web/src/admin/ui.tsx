import type { AllergenResponse } from '@plateguard/contracts';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';

export const input =
  'min-h-10 w-full rounded-[10px] border border-line bg-card px-3 text-[15px] text-ink';
export const button =
  'press min-h-10 rounded-[10px] border border-line bg-card px-3.5 text-[14.5px] font-medium text-ink disabled:opacity-50';
export const primary =
  'press min-h-10 rounded-[10px] bg-brand px-4 text-[14.5px] font-semibold text-white disabled:opacity-50';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-[13.5px] font-medium text-soft">
      {label}
      {children}
      {hint && <span className="text-[12.5px] font-normal">{hint}</span>}
    </label>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2.5 text-[14.5px]">
      <input
        type="checkbox"
        className="mt-1 size-4 accent-[var(--pg-brand)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="block text-[12.5px] text-soft">{hint}</span>}
      </span>
    </label>
  );
}

/** Allergen chips, subtypes indented under their group. */
export function AllergenPicker({
  label,
  allergens,
  value,
  onChange,
}: {
  label: string;
  allergens: AllergenResponse[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  const groups = allergens.filter((a) => !a.parent);
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-[13.5px] font-medium text-soft">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {groups.flatMap((g) =>
          [g, ...allergens.filter((a) => a.parent === g.code)].map((a) => (
            <button
              key={a.code}
              type="button"
              aria-pressed={value.includes(a.code)}
              onClick={() => toggle(a.code)}
              className={`rounded-full border px-2.5 py-1 text-[13px] ${
                value.includes(a.code)
                  ? 'border-brand-ink bg-brand-soft font-semibold text-brand-ink'
                  : 'border-line bg-card text-ink'
              } ${a.parent ? 'italic' : ''}`}
            >
              {a.name}
            </button>
          )),
        )}
      </div>
    </fieldset>
  );
}

/** A searchable list of checkboxes, for picking ingredients or components. */
export function CheckList<T extends { id: string; name: string }>({
  label,
  items,
  value,
  onChange,
  extra,
}: {
  label: string;
  items: T[];
  value: string[];
  onChange: (v: string[]) => void;
  extra?: (item: T) => ReactNode;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const shown = items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-[13.5px] font-medium text-soft">
        {label} <span className="font-normal">({value.length})</span>
      </legend>
      {items.length > 8 && (
        <input
          className={input}
          placeholder={t('admin:filter')}
          aria-label={`${t('admin:filter')}: ${label}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <div className="max-h-56 overflow-y-auto rounded-[10px] border border-line bg-card px-3 py-1">
        {shown.length === 0 && <p className="py-2 text-[13.5px] text-soft">{t('admin:none')}</p>}
        {shown.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-2 py-1">
            <Toggle
              label={i.name}
              checked={value.includes(i.id)}
              onChange={(on) => onChange(on ? [...value, i.id] : value.filter((id) => id !== i.id))}
            />
            {value.includes(i.id) && extra?.(i)}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/** A list on the left, the editor on the right. */
export function MasterDetail({
  items,
  selected,
  onSelect,
  onNew,
  newLabel,
  detail,
}: {
  items: { id: string; name: string; meta?: ReactNode }[];
  selected: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  newLabel: string;
  detail: ReactNode;
}) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
      <div className="grid gap-2">
        <button type="button" className={button} onClick={onNew}>
          + {newLabel}
        </button>
        <ul className="overflow-hidden rounded-[14px] bg-card">
          {items.map((i) => (
            <li key={i.id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                aria-current={selected === i.id}
                onClick={() => onSelect(i.id)}
                className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-[14.5px] ${
                  selected === i.id ? 'bg-brand-soft font-semibold text-brand-ink' : ''
                }`}
              >
                <span>{i.name}</span>
                {i.meta}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <section className="rounded-[18px] bg-card p-5 shadow-card">{detail}</section>
    </div>
  );
}

/** The error code of a failed save, as a sentence. */
export function SaveError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : 'HTTP_ERROR';
  return (
    <p role="alert" className="text-[14px] font-medium text-red">
      {t(`admin:errors.${code}`, { defaultValue: t('common:saveError') })}
    </p>
  );
}
