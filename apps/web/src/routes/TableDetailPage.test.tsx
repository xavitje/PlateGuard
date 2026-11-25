import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { I18nProvider } from '../i18n';
import { createMemoryClient } from '../api/memory-client';
import { ServiceProvider } from '../service/ServiceProvider';
import { TableDetailPage } from './TableDetailPage';

function renderTable(label: string) {
  const router = createMemoryRouter([{ path: '/tables/:label', element: <TableDetailPage /> }], {
    initialEntries: [`/tables/${label}`],
  });
  return render(
    <I18nProvider locale="en">
      <ServiceProvider client={createMemoryClient()}>
        <RouterProvider router={router} />
      </ServiceProvider>
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe('TableDetailPage', () => {
  it('judges the menu live with the shared engine', async () => {
    renderTable('12');
    fireEvent.click(await screen.findByRole('tab', { name: /3/ }));
    expect((await screen.findAllByText('Jus → GF jus')).length).toBeGreaterThan(0);
  });

  it('adds a dish to the seat order, and removes it again', async () => {
    renderTable('5');
    fireEvent.click(await screen.findByRole('button', { name: 'Order Tomato soup' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Remove Tomato soup from the order' }),
    );
    expect(await screen.findByText('Nothing ordered yet')).toBeTruthy();
  });

  it("suggests the restaurant's ingredients, synonyms included, and checks a pick against the recipes", async () => {
    renderTable('5');
    const input = await screen.findByPlaceholderText(/tomato/i);
    fireEvent.change(input, { target: { value: 'tomaat' } });
    fireEvent.click(await screen.findByRole('button', { name: /^Tomato/ }));
    expect(await screen.findAllByRole('radiogroup')).toHaveLength(1);
    expect(await screen.findByText(/Checked against the recipes/)).toBeTruthy();
    expect(screen.queryByText(/Check by hand: Tomato/)).toBeNull();
    // Picked ingredients start as Severe: the kitchen still checks traces of it by hand.
    expect(screen.getAllByText(/Check for traces of Tomato by hand/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('radio', { name: /allergy/i }));
    await waitFor(() => expect(screen.queryByText(/Check for traces of Tomato/)).toBeNull());
  });

  it('lets the waiter keep their own text for several allergies, each checked by hand', async () => {
    renderTable('5');
    const input = await screen.findByPlaceholderText(/tomato/i);
    for (const label of ['Sunflower oil', 'Lupin flour mix']) {
      fireEvent.change(input, { target: { value: label } });
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`Use “${label}”`) }));
    }
    expect(await screen.findAllByRole('radiogroup')).toHaveLength(2);
    expect(screen.getAllByText(/Check by hand: Sunflower oil/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Check by hand: Lupin flour mix/).length).toBeGreaterThan(0);
  });
});
