import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createMemoryClient } from '../api/memory-client';
import type { ServiceClient } from '../api/client';
import { I18nProvider } from '../i18n';
import { ServiceProvider } from '../service/ServiceProvider';
import { AlertsPage } from './AlertsPage';
import { KitchenPage } from './KitchenPage';
import { TableDetailPage } from './TableDetailPage';

function renderApp(path: string, client: ServiceClient = createMemoryClient()) {
  const router = createMemoryRouter(
    [
      { path: '/kitchen', element: <KitchenPage /> },
      { path: '/alerts', element: <AlertsPage /> },
      { path: '/tables/:label', element: <TableDetailPage /> },
      { path: '/profile', element: <p>Profile screen</p> },
    ],
    { initialEntries: [path] },
  );
  render(
    <I18nProvider locale="en">
      <ServiceProvider client={client} signedIn>
        <RouterProvider router={router} />
      </ServiceProvider>
    </I18nProvider>,
  );
  return router;
}

const ticket = (name: RegExp) => screen.getByRole('button', { name });

afterEach(cleanup);

describe('KitchenPage', () => {
  it('exit kitchen mode goes to Profile, even when the kitchen was the first page', async () => {
    const router = renderApp('/kitchen');
    fireEvent.click(await screen.findByRole('button', { name: 'Exit kitchen mode' }));
    await screen.findByText('Profile screen');
    expect(router.state.location.pathname).toBe('/profile');
  });

  it('a plate that must not go out can only be sent back, and the waiter sees why', async () => {
    const router = renderApp('/kitchen');
    expect(await screen.findByText('2 allergy plates')).toBeTruthy();
    fireEvent.click(ticket(/Table 7 · Seat 2/));
    const card = screen.getByRole('region', { name: 'Tomato soup' });
    expect(within(card).getByRole('alert').textContent).toMatch(/must not go out/);
    expect(within(card).queryByRole('button', { name: /Checked/ })).toBeNull();

    fireEvent.click(within(card).getByRole('button', { name: 'Send back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cannot be made safely' }));
    expect(await screen.findByText('1 allergy plate')).toBeTruthy();

    await router.navigate('/tables/7?seat=2');
    expect(await screen.findByText(/Sent back by the kitchen: Cannot be made safely/)).toBeTruthy();
    await router.navigate('/alerts');
    expect(await screen.findByText('Kitchen sent it back: Cannot be made safely')).toBeTruthy();
  });

  it('a chef approves a blocked plate only with the guest consent and a reason', async () => {
    const router = renderApp('/kitchen');
    expect(await screen.findByText('2 allergy plates')).toBeTruthy();
    fireEvent.click(ticket(/Table 7 · Seat 2/));
    const card = screen.getByRole('region', { name: 'Tomato soup' });
    fireEvent.click(within(card).getByRole('button', { name: 'Approve anyway' }));
    const form = within(card).getByRole('form', { name: 'Approve this plate anyway' });
    const send = within(form).getByRole('button', { name: 'Approve' }) as HTMLButtonElement;
    fireEvent.change(within(form).getByRole('textbox'), {
      target: { value: 'Guest knows, mild reaction only' },
    });
    expect(send.disabled).toBe(true);
    fireEvent.click(
      within(form).getByRole('checkbox', { name: 'The guest has been told and agrees' }),
    );
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(
      await screen.findByText('Approved despite the block: Guest knows, mild reaction only'),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    // The waiter no longer gets a stop for it, and sees the approval at the table.
    await router.navigate('/alerts');
    expect(await screen.findByText('1 open alert · 1 unread')).toBeTruthy();
    await router.navigate('/tables/7?seat=2');
    expect(
      await screen.findByText('Approved by the kitchen: Guest knows, mild reaction only'),
    ).toBeTruthy();
  });

  it('confirms only with every point ticked; with the pass check, serves after it', async () => {
    const client = createMemoryClient();
    await client.admin.saveSettings('demo', { passCheck: true });
    renderApp('/kitchen', client);
    fireEvent.click(await screen.findByRole('button', { name: /Table 12 · Seat 3/ }));
    const card = screen.getByRole('region', { name: 'Steak, jus and fries' });
    const boxes = within(card).getAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThan(2);
    const confirm = within(card).getByRole('button', { name: `${boxes.length} points left` });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    boxes.forEach((b) => fireEvent.click(b));
    fireEvent.click(within(card).getByRole('button', { name: 'Checked, plate is ready' }));

    expect(await screen.findByText('At the pass')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Checked at the pass' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Served' }));
    // Only the soup that must go back is left.
    await waitFor(() => expect(screen.queryByText('At the pass')).toBeNull());
    expect(screen.getByText('1 allergy plate')).toBeTruthy();
  });

  it('ticks every point at once, and still needs the tap on "checked"', async () => {
    renderApp('/kitchen', createMemoryClient());
    fireEvent.click(await screen.findByRole('button', { name: /Table 12 · Seat 3/ }));
    const card = screen.getByRole('region', { name: 'Steak, jus and fries' });
    const boxes = within(card).getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(within(card).getByRole('button', { name: `Tick all ${boxes.length} points` }));
    expect(boxes.every((b) => b.checked)).toBe(true);
    expect(within(card).queryByRole('button', { name: /^Tick all/ })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Checked, plate is ready' }));
    expect(await screen.findByText(/Steak, jus and fries · checked/)).toBeTruthy();
  });
});
