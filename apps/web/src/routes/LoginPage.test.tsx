import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createMemoryClient } from '../api/memory-client';
import { I18nProvider } from '../i18n';
import { ServiceProvider } from '../service/ServiceProvider';
import { TabsLayout } from '../shell/TabsLayout';
import { LoginPage } from './LoginPage';
import type { Role } from '@plateguard/domain';

function renderApp(role: Role = 'WAITER') {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { element: <TabsLayout />, children: [{ path: '/tables', element: <p>Tables screen</p> }] },
      { path: '/kitchen', element: <p>Kitchen screen</p> },
      { path: '/admin', element: <p>Admin screen</p> },
    ],
    { initialEntries: ['/tables'] },
  );
  render(
    <I18nProvider locale="en">
      <ServiceProvider client={createMemoryClient(undefined, undefined, role)} signedIn={false}>
        <RouterProvider router={router} />
      </ServiceProvider>
    </I18nProvider>,
  );
  return router;
}

afterEach(cleanup);

describe('LoginPage', () => {
  it('sends a signed-out device to sign in, then back to the tables', async () => {
    const router = renderApp();
    expect(screen.queryByRole('button', { name: 'Demo Waiter' })).toBeNull();
    fireEvent.change(await screen.findByLabelText('First name'), { target: { value: 'Someone' } });
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/Nobody with this first name/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'demo' } });
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Wrong PIN. 4 tries left before it locks.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Tables screen')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/tables');
  });

  it.each([
    ['COOK', 'Kitchen screen'],
    ['RUNNER', 'Kitchen screen'],
    ['MANAGER', 'Admin screen'],
  ] as const)('one sign-in: a %s starts on their own screen', async (role, screenText) => {
    renderApp(role);
    fireEvent.change(await screen.findByLabelText('First name'), { target: { value: 'Demo' } });
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(screenText)).toBeTruthy();
  });
});
