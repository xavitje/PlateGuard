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

  it("suggests the restaurant's ingredients, synonyms included, and checks a pick against the recipes", async () => {
    renderTable('5');
    const input = await screen.findByPlaceholderText(/tomato/i);
    fireEvent.change(input, { target: { value: 'tomaat' } });
    fireEvent.click(screen.getByRole('button', { name: /^Tomato/ }));
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1);
    expect(screen.getByText(/Checked against the recipes/)).toBeTruthy();
    expect(screen.queryByText(/Check by hand: Tomato/)).toBeNull();
    // Picked ingredients start as Severe: the kitchen still checks traces of it by hand.
    expect(screen.getAllByText(/Check for traces of Tomato by hand/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('radio', { name: /allergy/i }));
    expect(screen.queryByText(/Check for traces of Tomato/)).toBeNull();
  });

  it('lets the waiter keep their own text for several allergies, each checked by hand', async () => {
    renderTable('5');
    const input = await screen.findByPlaceholderText(/tomato/i);
    for (const label of ['Sunflower oil', 'Lupin flour mix']) {
      fireEvent.change(input, { target: { value: label } });
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`Use “${label}”`) }));
    }
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2);
    expect(screen.getAllByText(/Check by hand: Sunflower oil/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Check by hand: Lupin flour mix/).length).toBeGreaterThan(0);
  });
});
