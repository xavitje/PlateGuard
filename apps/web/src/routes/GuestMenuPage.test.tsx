import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createMemoryClient } from '../api/memory-client';
import { I18nProvider } from '../i18n';
import { ServiceProvider } from '../service/ServiceProvider';
import { GuestMenuPage } from './GuestMenuPage';

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '/menu/:slug', element: <GuestMenuPage /> }], {
    initialEntries: [path],
  });
  render(
    <I18nProvider locale="en">
      <ServiceProvider client={createMemoryClient()}>
        <RouterProvider router={router} />
      </ServiceProvider>
    </I18nProvider>,
  );
  return router;
}

afterEach(cleanup);

describe('GuestMenuPage', () => {
  it('shows the menu without outcomes until the guest picks what they avoid', async () => {
    const router = renderAt('/menu/demo');
    expect(await screen.findByText('Brasserie De Haven')).toBeTruthy();
    expect(screen.getByText('Tomato soup')).toBeTruthy();
    expect(document.querySelector('[data-outcome]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Gluten' }));
    expect(await screen.findByText('Jus replaced by GF jus')).toBeTruthy();
    expect(router.state.location.search).toBe('?avoid=GLUTEN');
    const card = screen.getByRole('link', { name: 'Allergen card to print (PDF)' });
    expect(card.getAttribute('href')).toBe(
      '/api/public/locations/demo/allergen-card.pdf?locale=en',
    );
  });

  it('keeps the choice from the link', async () => {
    renderAt('/menu/demo?avoid=GLUTEN,NOPE');
    expect(await screen.findByText('Jus replaced by GF jus')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gluten' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('says so when the location does not exist', async () => {
    renderAt('/menu/nowhere');
    expect(await screen.findByText('This menu could not be found.')).toBeTruthy();
  });
});
