/**
 * The device's shift session: the PIN login token and which location this device serves.
 * Kept in localStorage so a reload keeps the waiter signed in until the shift ends (12 hours).
 * Every access is wrapped: private mode or blocked storage falls back to memory.
 */
const TOKEN_KEY = 'pg.session';
const LOCATION_KEY = 'pg.location';

let memoryToken: string | null = null;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: this session lasts until the tab closes.
  }
}

export function getToken(): string | null {
  return memoryToken ?? read(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  memoryToken = token;
  write(TOKEN_KEY, token);
}

/** The location slug this device signs in to: set once, from ?location= or the build default. */
export function deviceLocation(search = ''): string {
  const fromUrl = new URLSearchParams(search).get('location');
  if (fromUrl) write(LOCATION_KEY, fromUrl);
  return fromUrl ?? read(LOCATION_KEY) ?? import.meta.env.VITE_LOCATION_SLUG ?? 'de-haven-demo';
}
