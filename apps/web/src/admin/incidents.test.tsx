import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { I18nProvider } from '../i18n';
import { createMemoryClient } from '../api/memory-client';
import { TableDetailPage } from '../routes/TableDetailPage';
import { ServiceProvider } from '../service/ServiceProvider';
import { IncidentsPage } from './IncidentsPage';

afterEach(cleanup);

describe('Incidents', () => {
  it('is reported at the table and closed in admin once cause and measure are written', async () => {
    const client = createMemoryClient();
    const router = createMemoryRouter(
      [
        { path: '/tables/:label', element: <TableDetailPage /> },
        { path: '/admin/incidents', element: <IncidentsPage /> },
      ],
      { initialEntries: ['/tables/12'] },
    );
    render(
      <I18nProvider locale="en">
        <ServiceProvider client={client} signedIn>
          <RouterProvider router={router} />
        </ServiceProvider>
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Report incident' }));
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Guest had itchy lips after the soup' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Incident reported. A manager follows it up.')).toBeTruthy();

    await router.navigate('/admin/incidents');
    fireEvent.click(await screen.findByRole('button', { name: /Table 12 · seat 1/ }));
    expect(await screen.findByText('Guest had itchy lips after the soup')).toBeTruthy();
    const close = screen.getByRole('button', { name: 'Save and close' }) as HTMLButtonElement;
    expect(close.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Cause'), { target: { value: 'Wrong ladle' } });
    fireEvent.change(screen.getByLabelText('Measure'), {
      target: { value: 'Separate ladles per pot' },
    });
    fireEvent.click(close);
    expect(await screen.findByRole('button', { name: 'Reopen' })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('Closed').length).toBeGreaterThan(0));
  });
});
