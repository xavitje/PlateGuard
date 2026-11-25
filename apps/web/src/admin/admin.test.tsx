import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n';
import { createMemoryClient } from '../api/memory-client';
import { ServiceProvider } from '../service/ServiceProvider';
import { MenuPage } from './MenuPage';
import { RecipesPage } from './RecipesPage';

function renderPage(page: React.ReactNode) {
  return render(
    <I18nProvider locale="en">
      <ServiceProvider client={createMemoryClient()} signedIn>
        {page}
      </ServiceProvider>
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe('Recipes admin', () => {
  it('adds an ingredient with its allergens, verified', async () => {
    renderPage(<RecipesPage />);
    fireEvent.click(await screen.findByRole('button', { name: '+ New ingredient' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pesto' } });
    const contains = screen.getByRole('group', { name: 'Contains' });
    fireEvent.click(await within(contains).findByRole('button', { name: 'Nuts' }));
    fireEvent.click(screen.getByLabelText(/Verified against the label/));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const row = await screen.findByRole('button', { name: 'Pesto' });
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(
      within(contains).getByRole('button', { name: 'Nuts' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('builds a dish from components, in plate order', async () => {
    renderPage(<RecipesPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Dishes' }));
    fireEvent.click(await screen.findByRole('button', { name: '+ New dish' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fries' } });
    const add = screen.getByRole('combobox', { name: 'Add a component' });
    await within(add).findByRole('option', { name: 'Fries' });
    fireEvent.change(add, { target: { value: 'c-fries' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Fries' })).toBeTruthy();
  });
});

describe('Menu admin', () => {
  it('publishes the draft as a new version after a confirmation', async () => {
    renderPage(<MenuPage />);
    expect(await screen.findByText(/Version 1 is live/)).toBeTruthy();
    const publish = screen.getByRole('button', { name: 'Publish' }) as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Tomato soup'));
    await waitFor(() => expect(publish.disabled).toBe(false));
    fireEvent.click(publish);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, publish now' }));
    expect(await screen.findByText(/Version 2 is live/)).toBeTruthy();
    expect(screen.getByText('The live menu matches the draft.')).toBeTruthy();
  });
});
