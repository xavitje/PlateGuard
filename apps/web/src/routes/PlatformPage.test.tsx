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

describe('PlatformPage', () => {
  it('signs in with email, password and code, apart from the shift session', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/platform/login') {
        const body = JSON.parse(String(init?.body)) as { code: string };
        return body.code === '123456'
          ? json(200, { token: 'p-token', expiresAt: '', me: { email: 'rafi@example.com' } })
          : json(401, { code: 'LOGIN_INVALID' });
      }
      if (url === '/api/platform/me') return json(200, { email: 'rafi@example.com' });
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
    expect(localStorage.getItem('pg.platform')).toBe('p-token');
    expect(localStorage.getItem('pg.session')).toBeNull();
    const meCall = fetch.mock.calls.find(([u]) => u === '/api/platform/me');
    expect(new Headers(meCall?.[1]?.headers).get('authorization')).toBe('Bearer p-token');

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(localStorage.getItem('pg.platform')).toBeNull();
  });
});
