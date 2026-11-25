import type { AdminTable, TablePosition } from '@plateguard/contracts';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
/** A pointer that moves less than this many pixels clicked the table instead of dragging it. */
const DRAG_THRESHOLD = 4;

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

/** Table size on the drawing, in percent of the canvas width, from its seats and shape. */
export function tableSize(t: Pick<AdminTable, 'seats' | 'shape'>) {
  const base = 7 + Math.min(t.seats, 12) * 0.9;
  return t.shape === 'RECT' ? { w: base * 1.6, h: base * 0.75 } : { w: base, h: base };
}

/**
 * The floor drawn to scale-free percentages. Drag a table to move it, or focus it and use the
 * arrow keys (Shift for bigger steps). A click without moving opens the table's form.
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
  /** Called once per finished move, with every table's position on this floor. */
  onMove: (positions: { id: string; x: number; y: number }[]) => void;
}) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    id: string;
    startX: number;
    startY: number;
    moved: boolean;
    at: TablePosition;
  } | null>(null);
  const start = startPositions(tables);
  const at = (id: string) =>
    dragging?.id === id ? dragging.at : (start.get(id) ?? { x: 50, y: 50 });
  const commit = (id: string, pos: TablePosition) =>
    onMove(tables.map((tb) => ({ id: tb.id, ...(tb.id === id ? pos : start.get(tb.id)!) })));

  const down = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging({ id, startX: e.clientX, startY: e.clientY, moved: false, at: at(id) });
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const box = canvas.current?.getBoundingClientRect();
    if (!dragging || !box || box.width === 0) return;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    if (!dragging.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    const from = start.get(dragging.id) ?? dragging.at;
    setDragging({
      ...dragging,
      moved: true,
      at: { x: clamp(from.x + (dx / box.width) * 100), y: clamp(from.y + (dy / box.height) * 100) },
    });
  };
  const up = () => {
    if (!dragging) return;
    if (dragging.moved) commit(dragging.id, dragging.at);
    else onSelect(dragging.id);
    setDragging(null);
  };
  const key = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const step = e.shiftKey ? 5 : 1;
    const d = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[e.key];
    if (!d) return;
    e.preventDefault();
    const p = at(id);
    commit(id, { x: clamp(p.x + d[0]!), y: clamp(p.y + d[1]!) });
  };

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
            const size = tableSize(tb);
            return (
              <button
                key={tb.id}
                type="button"
                aria-label={t('admin:floors.editTable', { label: tb.label })}
                aria-description={t('admin:floors.dragHint')}
                aria-pressed={selected === tb.id}
                data-x={p.x}
                data-y={p.y}
                onPointerDown={(e) => down(e, tb.id)}
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
                  width: `${size.w}%`,
                  aspectRatio: `${size.w} / ${size.h}`,
                }}
                className={`absolute grid -translate-x-1/2 -translate-y-1/2 cursor-grab place-items-center border text-center leading-tight select-none active:cursor-grabbing ${
                  tb.shape === 'ROUND' ? 'rounded-full' : 'rounded-[10px]'
                } ${
                  selected === tb.id
                    ? 'border-brand-ink bg-brand-soft'
                    : tb.position
                      ? 'border-line bg-card shadow-sm'
                      : 'border-dashed border-soft bg-card'
                } ${dragging?.id === tb.id && dragging.moved ? 'z-10 shadow-lg' : ''}`}
              >
                <span>
                  <b className="block text-[15px] font-semibold">{tb.label}</b>
                  <span className="text-[11.5px] text-soft">
                    {t('admin:floors.seats', { count: tb.seats })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-1.5 text-[12.5px] text-soft">{t('admin:floors.dragHint')}</p>
    </div>
  );
}
