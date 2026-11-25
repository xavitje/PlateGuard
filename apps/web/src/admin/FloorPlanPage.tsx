import type { AdminFloor, AdminTable, TableDraft } from '@plateguard/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdmin, useAdminSave } from './hooks';
import { button, Field, input, primary, SaveError, Toggle } from './ui';

const SHAPES = ['ROUND', 'SQUARE', 'RECT'] as const;

/** Floors in the order waiters see them, and the tables on each floor. */
export function FloorPlanPage() {
  const { t } = useTranslation();
  const floors = useAdmin('floors').data;
  const addFloor = useAdminSave((c, l, name: string) => c.saveFloor(l, null, { name }));
  const order = useAdminSave((c, l, ids: string[]) => c.orderFloors(l, ids));
  const [newFloor, setNewFloor] = useState('');
  if (!floors) return <p className="text-soft">{t('common:loading')}</p>;
  const move = (i: number, by: number) => {
    const ids = floors.map((f) => f.id);
    [ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!];
    order.mutate([ids]);
  };
  return (
    <div className="grid max-w-4xl gap-5">
      <div>
        <h1 className="mb-1 text-3xl font-semibold">{t('admin:nav.floorPlan')}</h1>
        <p className="text-soft">{t('admin:floors.intro')}</p>
      </div>
      {floors.map((f, i) => (
        <FloorCard
          key={f.id}
          floor={f}
          floors={floors}
          first={i === 0}
          last={i === floors.length - 1}
          onMove={(by) => move(i, by)}
        />
      ))}
      <SaveError error={order.error} />
      <form
        className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:flex sm:flex-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          addFloor.mutate([newFloor], { onSuccess: () => setNewFloor('') });
        }}
      >
        <Field label={t('admin:floors.newFloor')}>
          <input
            className={input}
            required
            placeholder={t('admin:floors.newFloorHint')}
            value={newFloor}
            onChange={(e) => setNewFloor(e.target.value)}
          />
        </Field>
        <button className={primary} disabled={addFloor.isPending}>
          {t('admin:add')}
        </button>
        <SaveError error={addFloor.error} />
      </form>
    </div>
  );
}

function FloorCard({
  floor,
  floors,
  first,
  last,
  onMove,
}: {
  floor: AdminFloor;
  floors: AdminFloor[];
  first: boolean;
  last: boolean;
  onMove: (by: number) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(floor.name);
  const [editing, setEditing] = useState<string | null>(null);
  const save = useAdminSave((c, l, body: { name: string; hidden: boolean }) =>
    c.saveFloor(l, floor.id, body),
  );
  const active = floor.tables.filter((tb) => tb.active);
  const removed = floor.tables.filter((tb) => !tb.active);
  return (
    <section
      aria-label={floor.name}
      className="grid gap-4 rounded-[18px] bg-card p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate([{ name, hidden: floor.hidden }]);
          }}
        >
          <Field label={t('admin:floors.name')}>
            <input
              className={input}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {name !== floor.name && (
            <button className={button} disabled={save.isPending}>
              {t('admin:save')}
            </button>
          )}
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <Toggle
            label={t('admin:floors.hidden')}
            checked={floor.hidden}
            onChange={(hidden) => save.mutate([{ name: floor.name, hidden }])}
          />
          <span className="flex gap-1">
            <button
              type="button"
              className={button}
              disabled={first}
              aria-label={t('admin:moveUp', { name: floor.name })}
              onClick={() => onMove(-1)}
            >
              ↑
            </button>
            <button
              type="button"
              className={button}
              disabled={last}
              aria-label={t('admin:moveDown', { name: floor.name })}
              onClick={() => onMove(1)}
            >
              ↓
            </button>
          </span>
        </div>
      </div>
      {floor.hidden && <p className="text-[13.5px] text-soft">{t('admin:floors.hiddenHint')}</p>}
      <SaveError error={save.error} />

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
        {active.map((tb) => (
          <li key={tb.id}>
            <button
              type="button"
              aria-label={t('admin:floors.editTable', { label: tb.label })}
              aria-expanded={editing === tb.id}
              onClick={() => setEditing(editing === tb.id ? null : tb.id)}
              className={`grid w-full gap-0.5 border p-3 text-left ${
                tb.shape === 'ROUND' ? 'rounded-[28px]' : 'rounded-[12px]'
              } ${editing === tb.id ? 'border-brand-ink bg-brand-soft' : 'border-line bg-mist'}`}
            >
              <span className="text-lg font-semibold">{tb.label}</span>
              <span className="text-[13px] text-soft">
                {t('admin:floors.seats', { count: tb.seats })}
              </span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setEditing(editing === 'new' ? null : 'new')}
            className="grid h-full min-h-[68px] w-full place-items-center rounded-[12px] border border-dashed border-line text-[14px] text-soft"
          >
            + {t('admin:floors.addTable')}
          </button>
        </li>
      </ul>
      {editing && (
        <TableForm
          key={editing}
          table={floor.tables.find((tb) => tb.id === editing)}
          floorId={floor.id}
          floors={floors}
          onDone={() => setEditing(null)}
        />
      )}
      {removed.length > 0 && (
        <p className="text-[13.5px] text-soft">
          {t('admin:floors.removed')}{' '}
          {removed.map((tb, i) => (
            <span key={tb.id}>
              {i > 0 && ', '}
              <button type="button" className="underline" onClick={() => setEditing(tb.id)}>
                {tb.label}
              </button>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

function TableForm({
  table,
  floorId,
  floors,
  onDone,
}: {
  table?: AdminTable;
  floorId: string;
  floors: AdminFloor[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(table?.label ?? '');
  const [seats, setSeats] = useState(table?.seats ?? 4);
  const [shape, setShape] = useState(table?.shape ?? 'SQUARE');
  const [floor, setFloor] = useState(table?.floorId ?? floorId);
  const [externalRef, setExternalRef] = useState(table?.externalRef ?? '');
  const save = useAdminSave((c, l, body: TableDraft) => c.saveTable(l, table?.id ?? null, body));
  const body = (active: boolean): TableDraft => ({
    floorId: floor,
    label,
    seats,
    shape,
    externalRef: externalRef || null,
    active,
  });
  return (
    <form
      className="grid gap-3 rounded-[14px] border border-line p-3 sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate([body(true)], { onSuccess: onDone });
      }}
    >
      <h3 className="font-semibold">
        {table ? t('admin:floors.tableTitle', { label: table.label }) : t('admin:floors.addTable')}
      </h3>
      {table?.inUse && <p className="text-[13.5px] text-soft">{t('admin:floors.inUse')}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('admin:floors.label')}>
          <input
            className={input}
            required
            maxLength={12}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <Field label={t('admin:floors.seatCount')}>
          <input
            className={input}
            type="number"
            min={1}
            max={40}
            value={seats}
            onChange={(e) => setSeats(Number(e.target.value))}
          />
        </Field>
        <Field label={t('admin:floors.shape')}>
          <select
            className={input}
            value={shape}
            onChange={(e) => setShape(e.target.value as AdminTable['shape'])}
          >
            {SHAPES.map((s) => (
              <option key={s} value={s}>
                {t(`admin:floors.shapes.${s}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('admin:floors.floor')}>
          <select className={input} value={floor} onChange={(e) => setFloor(e.target.value)}>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('admin:floors.externalRef')} hint={t('admin:floors.externalRefHint')}>
          <input
            className={input}
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
          />
        </Field>
      </div>
      <SaveError error={save.error} />
      <div className="flex flex-wrap gap-2">
        <button className={primary} disabled={save.isPending}>
          {table && !table.active ? t('admin:floors.restore') : t('admin:save')}
        </button>
        <button type="button" className={button} onClick={onDone}>
          {t('admin:cancel')}
        </button>
        {table?.active && (
          <button
            type="button"
            className={`${button} text-red`}
            disabled={save.isPending || table.inUse}
            onClick={() => save.mutate([body(false)], { onSuccess: onDone })}
          >
            {t('admin:floors.removeTable')}
          </button>
        )}
      </div>
    </form>
  );
}
