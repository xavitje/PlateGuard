import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createMemoryClient } from '../api/memory-client';
import { I18nProvider } from '../i18n';
import { ServiceProvider } from '../service/ServiceProvider';
import { TabsLayout } from '../shell/TabsLayout';
import { LoginPage } from './LoginPage';

function renderApp() {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { element: <TabsLayout />, children: [{ path: '/tables', element: <p>Tables screen</p> }] },
    ],
    { initialEntries: ['/tables'] },
  );
  render(
    <I18nProvider locale="en">
      <ServiceProvider client={createMemoryClient()} signedIn={false}>
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
    fireEvent.click(await screen.findByRole('button', { name: 'Demo Waiter' }));
    fireEvent.change(screen.getByLabelText('PIN for Demo Waiter'), { target: { value: '0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Wrong PIN. 4 tries left before it locks.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('PIN for Demo Waiter'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Tables screen')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/tables');
  });
});
