import type { PlatformLogin, PlatformLoginResponse, PlatformMe } from '@plateguard/contracts';
import { getPlatformToken } from '../session';
import { ApiError } from './client';

/** Platform administration calls. They carry the platform token, never the shift token. */
async function call<T>(path: string, body?: unknown): Promise<T> {
  const token = getPlatformToken();
  const res = await fetch(`/api/platform${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { code?: string };
    throw new ApiError(res.status, err.code ?? 'HTTP_ERROR');
  }
  return (await res.json()) as T;
}

export const platformApi = {
  login: (body: PlatformLogin) => call<PlatformLoginResponse>('/login', body),
  me: () => call<PlatformMe>('/me'),
};
