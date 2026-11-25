import type { AdminTable, FloorLayout } from '@plateguard/contracts';

/** A table after a layout change: what was sent replaces what it had. */
export function placed(tb: AdminTable, p: FloorLayout['tables'][number]): AdminTable {
  return {
    ...tb,
    position: { x: p.x, y: p.y },
    ...(p.w !== undefined || p.h !== undefined
      ? { size: p.w == null || p.h == null ? null : { w: p.w, h: p.h } }
      : {}),
    ...(p.rotation !== undefined ? { rotation: p.rotation } : {}),
  };
}
