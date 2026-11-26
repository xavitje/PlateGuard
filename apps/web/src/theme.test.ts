import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, storedTheme } from './theme';

describe('theme', () => {
  afterEach(() => applyTheme('system'));

  it('remembers light or dark on the whole page, and "system" follows the device again', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(storedTheme()).toBe('dark');
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(storedTheme()).toBe('system');
  });
});
