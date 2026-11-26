export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = 'pg.theme';

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(v as Theme) ? (v as Theme) : 'system';
  } catch {
    return 'system';
  }
}

/** Sets the whole app, kitchen included, to light or dark; "system" follows the device. */
export function applyTheme(theme: Theme): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode: the choice lasts for this session only.
  }
}
