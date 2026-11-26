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

/**
 * The location slug this device signs in to: from ?location=, from an earlier sign-in, or the
 * build default. Null on a new device; the first sign-in then finds the location.
 */
export function deviceLocation(search = ''): string | null {
  const fromUrl = new URLSearchParams(search).get('location');
  if (fromUrl) write(LOCATION_KEY, fromUrl);
  return fromUrl ?? read(LOCATION_KEY) ?? import.meta.env.VITE_LOCATION_SLUG ?? null;
}

/** After a sign-in: this device now serves that location. */
export function rememberLocation(slug: string): void {
  write(LOCATION_KEY, slug);
}

/** The platform admin's session (/platform), apart from the shift session of the device. */
const PLATFORM_KEY = 'pg.platform';

export const getPlatformToken = (): string | null => read(PLATFORM_KEY);
export const setPlatformToken = (token: string | null): void => write(PLATFORM_KEY, token);
