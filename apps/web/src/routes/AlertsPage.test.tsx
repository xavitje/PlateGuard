import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createMemoryClient } from '../api/memory-client';
import { I18nProvider } from '../i18n';
import { ServiceProvider } from '../service/ServiceProvider';
import { AlertsPage } from './AlertsPage';
import { TableDetailPage } from './TableDetailPage';

function renderApp(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/alerts', element: <AlertsPage /> },
      { path: '/tables/:label', element: <TableDetailPage /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <I18nProvider locale="en">
      <ServiceProvider client={createMemoryClient()} signedIn>
        <RouterProvider router={router} />
      </ServiceProvider>
    </I18nProvider>,
  );
  return router;
}

afterEach(cleanup);

describe('AlertsPage', () => {
  it('lists only ordered dishes that need attention, worst first', async () => {
    renderApp('/alerts');
    expect(await screen.findByText('2 open alerts')).toBeTruthy();
    const rows = screen.getAllByRole('link');
    expect(rows[0]?.textContent).toMatch(/Table 7/);
    expect(rows[0]?.textContent).toMatch(/Do not serve/);
    expect(rows[0]?.textContent).toMatch(/Seat 2 ordered Tomato soup/);
    expect(rows[1]?.textContent).toMatch(/Table 12/);
    expect(rows[1]?.textContent).toMatch(/Seat 3 ordered Steak, jus and fries · Jus → GF jus/);
  });

  it('an order at a seat with an allergy adds an alert; the menu alone does not', async () => {
    const router = renderApp('/tables/5');
    fireEvent.click(await screen.findByRole('button', { name: '+ Gluten' }));
    await screen.findByRole('radiogroup');
    await router.navigate('/alerts');
    expect(await screen.findByText('2 open alerts')).toBeTruthy();

    await router.navigate('/tables/5');
    fireEvent.click(await screen.findByRole('button', { name: 'Order Caesar salad' }));
    await screen.findByRole('button', { name: 'Remove Caesar salad from the order' });
    await router.navigate('/alerts');
    expect(await screen.findByText('3 open alerts')).toBeTruthy();
  });
});
