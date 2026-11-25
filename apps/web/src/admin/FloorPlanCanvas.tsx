import {
  TABLE_SIZE,
  type AdminTable,
  type FloorLayout,
  type TablePosition,
} from '@plateguard/contracts';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { button } from './ui';

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
const clampSize = (n: number) =>
  Math.min(TABLE_SIZE.max, Math.max(TABLE_SIZE.min, Math.round(n * 10) / 10));
const turn = (deg: number) => (((Math.round(deg) % 360) + 360) % 360) as number;
/** A pointer that moves less than this many pixels clicked the table instead of dragging it. */
const DRAG_THRESHOLD = 4;
const ROTATE_STEP = 15;

/**
 * Where tables without a position start: a tidy grid, so a new floor is usable at once. They are
 * saved where they stand the first time anything on the floor moves.
 */
export function startPositions(tables: AdminTable[]): Map<string, TablePosition> {
  const unplaced = tables.filter((t) => !t.position);
  const cols = Math.max(1, Math.ceil(Math.sqrt(unplaced.length * 1.6)));
  const rows = Math.max(1, Math.ceil(unplaced.length / cols));
  const out = new Map<string, TablePosition>();
  for (const t of tables) if (t.position) out.set(t.id, t.position);
  unplaced.forEach((t, i) =>
    out.set(t.id, {
      x: clamp(((i % cols) + 0.5) * (100 / cols)),
      y: clamp((Math.floor(i / cols) + 0.5) * (100 / rows)),
    }),
  );
  return out;
}

/** The area table centres live in: the drawing minus a margin for half a table. */
export const PLAN_AREA = 'absolute inset-x-[9%] inset-y-[13%]';

/** Size from the seats and shape, in percent of the drawing's width, for a table not sized by hand. */
export function tableSize(t: Pick<AdminTable, 'seats' | 'shape'>) {
  const base = 7 + Math.min(t.seats, 12) * 0.9;
  return t.shape === 'RECT' ? { w: base * 1.6, h: base * 0.75 } : { w: base, h: base };
}

/** The size a table is drawn at: set by hand, or from its seats. */
export const drawnSize = (t: Pick<AdminTable, 'seats' | 'shape' | 'size'>) =>
  t.size ?? tableSize(t);

interface Placed {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}
type Change = FloorLayout['tables'][number];

/** Grows or shrinks a table by `by` percent of the drawing's width, keeping its proportions. */
function scaled(p: Placed, by: number) {
  const w = clampSize(p.w + by);
  return { w, h: clampSize((p.h * w) / p.w) };
}

/**
 * The floor drawn to scale-free percentages. Drag a table to move it, or focus it and use the
 * arrow keys (Shift for bigger steps). The selected table has a corner handle to resize it, and
 * buttons to resize and turn it; on the keyboard + and - resize, Alt with an arrow changes one
 * side, and R turns it. A click without moving opens the table's form.
 */
export function FloorPlanCanvas({
  tables,
  selected,
  onSelect,
  onMove,
}: {
  tables: AdminTable[];
  selected: string | null;
  onSelect: (id: string) => void;
  /**
   * Called once per finished change, with every table's position on this floor and the size and
   * rotation of the table that changed.
   */
  onMove: (tables: Change[]) => void;
}) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    moved: boolean;
    at: Placed;
  } | null>(null);
  const start = startPositions(tables);
  const saved = (tb: AdminTable): Placed => ({
    ...(start.get(tb.id) ?? { x: 50, y: 50 }),
    ...drawnSize(tb),
    rotation: tb.rotation,
  });
  const byId = new Map(tables.map((tb) => [tb.id, tb]));
  const at = (id: string) => (dragging?.id === id ? dragging.at : saved(byId.get(id)!));
  /** `size: null` gives the table its size from the seats back. */
  const commit = (id: string, next: Partial<Placed>, size?: null) =>
    onMove(
      tables.map((tb) => {
        const pos = start.get(tb.id)!;
        if (tb.id !== id) return { id: tb.id, x: pos.x, y: pos.y };
        const p = { ...saved(tb), ...next };
        return {
          id,
          x: p.x,
          y: p.y,
          ...(size === null
            ? { w: null, h: null }
            : next.w !== undefined || next.h !== undefined
              ? { w: p.w, h: p.h }
              : {}),
          rotation: turn(p.rotation),
        };
      }),
    );

  const down = (e: PointerEvent<HTMLElement>, id: string, mode: 'move' | 'resize') => {
    if (mode === 'resize') e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging({ id, mode, startX: e.clientX, startY: e.clientY, moved: false, at: at(id) });
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const box = canvas.current?.getBoundingClientRect();
    if (!dragging || !box || box.width === 0) return;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    if (!dragging.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    const tb = byId.get(dragging.id)!;
    const from = saved(tb);
    let at: Placed;
    if (dragging.mode === 'move') {
      at = {
        ...from,
        x: clamp(from.x + (dx / box.width) * 100),
        y: clamp(from.y + (dy / box.height) * 100),
      };
    } else {
      // Sizes are in percent of the width on both axes. The pointer moves in screen space, the
      // handle sits on the turned corner, and the centre stays put, so a side grows by twice the
      // distance the corner moved along it.
      const px = (dx / box.width) * 100;
      const py = (dy / box.width) * 100;
      const a = (from.rotation * Math.PI) / 180;
      const along = px * Math.cos(a) + py * Math.sin(a);
      const across = -px * Math.sin(a) + py * Math.cos(a);
      const w = clampSize(from.w + 2 * along);
      const h = clampSize(from.h + 2 * across);
      const round = tb.shape === 'ROUND' ? clampSize((w + h) / 2) : null;
      at = { ...from, w: round ?? w, h: round ?? h };
    }
    setDragging({ ...dragging, moved: true, at });
  };
  const up = () => {
    if (!dragging) return;
    if (dragging.moved) {
      const { x, y, w, h } = dragging.at;
      commit(dragging.id, dragging.mode === 'move' ? { x, y } : { w, h });
    } else if (dragging.mode === 'move') onSelect(dragging.id);
    setDragging(null);
  };
  const grow = (id: string, by: number) => commit(id, scaled(at(id), by));
  const rotate = (id: string, by: number) => commit(id, { rotation: at(id).rotation + by });
  const key = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const step = e.shiftKey ? 5 : 1;
    const p = at(id);
    if (e.key === '+' || e.key === '=') grow(id, step);
    else if (e.key === '-' || e.key === '_') grow(id, -step);
    else if (e.key === 'r' || e.key === 'R') rotate(id, e.shiftKey ? -ROTATE_STEP : ROTATE_STEP);
    else {
      const d = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }[e.key];
      if (!d) return;
      if (e.altKey) {
        const round = byId.get(id)?.shape === 'ROUND';
        const by = d[0]! || -d[1]!;
        if (round) grow(id, by);
        else commit(id, d[0] ? { w: clampSize(p.w + by) } : { h: clampSize(p.h + by) });
      } else commit(id, { x: clamp(p.x + d[0]!), y: clamp(p.y + d[1]!) });
    }
    e.preventDefault();
  };

  const chosen = selected ? byId.get(selected) : undefined;
  return (
    <div>
      <div
        role="group"
        aria-label={t('admin:floors.plan')}
        className="relative aspect-[16/10] w-full touch-none overflow-hidden rounded-[14px] border border-line bg-mist [background-image:radial-gradient(var(--pg-line)_1px,transparent_1px)] [background-size:20px_20px]"
      >
        {/* Positions are inside a margin, so a table at the edge still shows whole. */}
        <div ref={canvas} className={PLAN_AREA}>
          {tables.map((tb) => {
            const p = at(tb.id);
            const active = dragging?.id === tb.id && dragging.moved;
            return (
              <button
                key={tb.id}
                type="button"
                aria-label={t('admin:floors.editTable', { label: tb.label })}
                aria-description={t('admin:floors.dragHint')}
                aria-pressed={selected === tb.id}
                data-x={p.x}
                data-y={p.y}
                data-w={p.w}
                data-h={p.h}
                data-rotation={p.rotation}
                onPointerDown={(e) => down(e, tb.id, 'move')}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={() => setDragging(null)}
                onKeyDown={(e) => key(e, tb.id)}
                onClick={(e) => {
                  // Keyboard and assistive tech click without pointer events.
                  if (e.detail === 0) onSelect(tb.id);
                }}
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: `${p.w}%`,
                  aspectRatio: `${p.w} / ${p.h}`,
                  transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
                }}
                className={`absolute grid cursor-grab place-items-center border text-center leading-tight select-none active:cursor-grabbing ${
                  tb.shape === 'ROUND' ? 'rounded-full' : 'rounded-[10px]'
                } ${
                  selected === tb.id
                    ? 'border-brand-ink bg-brand-soft'
                    : tb.position
                      ? 'border-line bg-card shadow-sm'
                      : 'border-dashed border-soft bg-card'
                } ${active ? 'z-20 shadow-lg' : selected === tb.id ? 'z-10' : ''}`}
              >
                {/* The label stays upright when the table turns. */}
                <span style={{ transform: `rotate(${-p.rotation}deg)` }}>
                  <b className="block text-[15px] font-semibold">{tb.label}</b>
                  <span className="text-[11.5px] text-soft">
                    {t('admin:floors.seats', { count: tb.seats })}
                  </span>
                </span>
                {selected === tb.id && (
                  <span
                    aria-hidden
                    data-handle="resize"
                    onPointerDown={(e) => down(e, tb.id, 'resize')}
                    className="absolute -right-2.5 -bottom-2.5 size-5 cursor-nwse-resize rounded-full border-2 border-card bg-brand shadow-sm"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-1.5 text-[12.5px] text-soft">{t('admin:floors.dragHint')}</p>
      {chosen && (
        <div
          role="toolbar"
          aria-label={t('admin:floors.shapeTools', { label: chosen.label })}
          className="mt-2 flex flex-wrap items-center gap-1.5"
        >
          <button type="button" className={button} onClick={() => grow(chosen.id, -2)}>
            − {t('admin:floors.smaller')}
          </button>
          <button type="button" className={button} onClick={() => grow(chosen.id, 2)}>
            + {t('admin:floors.bigger')}
          </button>
          <button type="button" className={button} onClick={() => rotate(chosen.id, -ROTATE_STEP)}>
            ↺ {t('admin:floors.rotateLeft')}
          </button>
          <button type="button" className={button} onClick={() => rotate(chosen.id, ROTATE_STEP)}>
            ↻ {t('admin:floors.rotateRight')}
          </button>
          {(chosen.size || chosen.rotation !== 0) && (
            <button
              type="button"
              className={button}
              onClick={() => commit(chosen.id, { rotation: 0 }, null)}
            >
              {t('admin:floors.resetShape')}
            </button>
          )}
          <span className="text-[12.5px] text-soft">{t('admin:floors.resizeHint')}</span>
        </div>
      )}
    </div>
  );
}
