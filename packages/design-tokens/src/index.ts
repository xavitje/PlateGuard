/** The same values as tokens.css, for places that need them in code (PWA manifest, canvas, PDF). */
export const colors = {
  brand: '#2f5bff',
  brandSoft: '#eaf0ff',
  ink: '#0f1115',
  mist: '#f4f5f7',
  line: '#e6e8ec',
  signal: '#ffd34d',
  red: '#e5484d',
  amber: '#f5a524',
  kitchenBg: '#111317',
} as const;

export const outcomeColors = {
  DO_NOT_SERVE: { bg: '#fde8e8', fg: '#c62a2f' },
  UNKNOWN: { bg: '#eceef2', fg: '#3d434f', hatched: true },
  CAUTION: { bg: '#fff3db', fg: '#8a5a00' },
  ADAPTABLE: { bg: '#e8eeff', fg: '#2445d6' },
  CLEAR_WITH_NOTE: { bg: '#f1f2f5', fg: '#3d434f' },
  CLEAR: { bg: '#f1f2f5', fg: '#3d434f' },
} as const;

export const radius = { sm: 9, md: 14, lg: 20 } as const;
export const targetMin = { app: 44, kitchen: 64 } as const;
export const fontStack = "'Geist', 'Inter', system-ui, -apple-system, sans-serif";
