import type {
  Plan,
  PlatformLogin,
  PlatformLoginResponse,
  PlatformMe,
  PlatformNewRestaurant,
  PlatformRestaurant,
  PlatformStats,
  StaffDraft,
  StaffMember,
} from '@plateguard/contracts';
import { getPlatformToken } from '../session';
import { ApiError } from './client';

/** Platform administration calls. They carry the platform token, never the shift token. */
async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = getPlatformToken();
  const res = await fetch(`/api/platform${path}`, {
    method,
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

const staffPath = (locationId: string) => `/locations/${encodeURIComponent(locationId)}/staff`;

export const platformApi = {
  login: (body: PlatformLogin) => call<PlatformLoginResponse>('/login', 'POST', body),
  me: () => call<PlatformMe>('/me'),
  stats: () => call<PlatformStats>('/stats'),
  restaurants: () => call<PlatformRestaurant[]>('/restaurants'),
  createRestaurant: (body: PlatformNewRestaurant) =>
    call<PlatformRestaurant[]>('/restaurants', 'POST', body),
  setPlan: (id: string, plan: Plan) =>
    call<PlatformRestaurant[]>(`/restaurants/${encodeURIComponent(id)}/plan`, 'PUT', { plan }),
  staff: (locationId: string) => call<StaffMember[]>(staffPath(locationId)),
  addStaff: (locationId: string, body: StaffDraft) =>
    call<StaffMember[]>(staffPath(locationId), 'POST', body),
  setPin: (locationId: string, userId: string, pin: string) =>
    call<StaffMember[]>(`${staffPath(locationId)}/${encodeURIComponent(userId)}/pin`, 'PUT', {
      pin,
    }),
};
