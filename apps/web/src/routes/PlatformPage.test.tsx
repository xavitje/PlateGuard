import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { PlatformPage } from './PlatformPage';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const bistro = {
  id: 'org-1',
  name: 'Bistro Noord',
  plan: 'free',
  createdAt: '2026-11-01T10:00:00.000Z',
  ownerEmail: 'owner@example.com',
  locations: [{ id: 'loc-1', name: 'Bistro Noord', slug: 'bistro-noord', staff: 1 }],
  plates30: 12,
  lastActivity: '2026-11-25T19:00:00.000Z',
};

const stats = {
  restaurants: 1,
  locations: 1,
  byPlan: { free: 1 },
  active7: 1,
  active30: 1,
  weeks: [
    { week: '2026-11-16', signups: 0, plates: 4, warnings: 1, overrides: 0, incidents: 0 },
    { week: '2026-11-23', signups: 1, plates: 8, warnings: 3, overrides: 1, incidents: 2 },
  ],
  incidents30: { LOW: 1, MEDIUM: 0, HIGH: 1 },
};

describe('PlatformPage', () => {
  it('signs in with email, password and code, apart from the shift session', async () => {
    const restaurants = [bistro];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/platform/login') {
        const body = JSON.parse(String(init?.body)) as { code: string };
        return body.code === '123456'
          ? json(200, { token: 'p-token', expiresAt: '', me: { email: 'rafi@example.com' } })
          : json(401, { code: 'LOGIN_INVALID' });
      }
      if (url === '/api/platform/me') return json(200, { email: 'rafi@example.com' });
      if (url === '/api/platform/restaurants' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { restaurant: string; plan: string };
        restaurants.unshift({ ...bistro, id: 'org-2', name: body.restaurant, plan: body.plan });
        return json(201, restaurants);
      }
      if (url === '/api/platform/restaurants') return json(200, restaurants);
      if (url.endsWith('/staff')) return json(200, []);
      if (url === '/api/platform/stats') return json(200, stats);
      return json(404, {});
    });
    vi.stubGlobal('fetch', fetch);
    render(
      <I18nProvider locale="en">
        <QueryClientProvider client={new QueryClient()}>
          <PlatformPage />
        </QueryClientProvider>
      </I18nProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'rafi@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long password' } });
    fireEvent.change(screen.getByLabelText('Code from your authenticator app'), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/That did not work/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Code from your authenticator app'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Signed in as rafi@example.com.')).toBeTruthy();
    expect(await screen.findByText('1 high · 0 medium · 1 low')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Per week' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /Bistro Noord/ }));
    expect(await screen.findByText(/12 plates in the last 30 days/)).toBeTruthy();
    expect(await screen.findByText(/Contact: owner@example.com/)).toBeTruthy();
    expect(screen.getByText(/login\?location=bistro-noord/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '+ New restaurant' }));
    fireEvent.change(screen.getByLabelText('Restaurant name'), { target: { value: 'Café Zuid' } });
    fireEvent.change(screen.getByLabelText("Owner's first name"), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText("Owner's email"), { target: { value: 'ana@x.nl' } });
    fireEvent.change(screen.getByLabelText("Owner's start PIN", { exact: false }), {
      target: { value: '2468' },
    });
    fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'kitchen' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create restaurant' }));
    expect(await screen.findByRole('heading', { name: 'Café Zuid' })).toBeTruthy();
    const created = fetch.mock.calls.find(
      ([, i]) => i?.method === 'POST' && i.body?.toString().includes('Café'),
    );
    expect(JSON.parse(String(created?.[1]?.body))).toMatchObject({ plan: 'kitchen', pin: '2468' });
    expect(localStorage.getItem('pg.platform')).toBe('p-token');
    expect(localStorage.getItem('pg.session')).toBeNull();
    const meCall = fetch.mock.calls.find(([u]) => u === '/api/platform/me');
    expect(new Headers(meCall?.[1]?.headers).get('authorization')).toBe('Bearer p-token');

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(localStorage.getItem('pg.platform')).toBeNull();
  });
});
