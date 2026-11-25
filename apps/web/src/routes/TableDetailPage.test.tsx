import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { I18nProvider } from '../i18n';
import { TableDetailPage } from './TableDetailPage';

function renderTable(label: string) {
  const router = createMemoryRouter([{ path: '/tables/:label', element: <TableDetailPage /> }], {
    initialEntries: [`/tables/${label}`],
  });
  return render(
    <I18nProvider locale="en">
      <RouterProvider router={router} />
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe('TableDetailPage', () => {
  it('judges the menu live with the shared engine', async () => {
    renderTable('12');
    fireEvent.click(await screen.findByRole('tab', { name: /3/ }));
    expect(await screen.findByText('Jus → GF jus')).toBeTruthy();
  });

  it('lets the waiter add several custom allergies, each checked by hand in the kitchen', async () => {
    renderTable('5');
    const input = await screen.findByPlaceholderText(/tomato/i);
    for (const label of ['Tomato', 'Sunflower oil']) {
      fireEvent.change(input, { target: { value: label } });
      fireEvent.click(screen.getByRole('button', { name: /other allergy/i }));
    }
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2);
    expect(screen.getAllByText(/Check by hand: Tomato/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Check by hand: Sunflower oil/).length).toBeGreaterThan(0);
  });
});
