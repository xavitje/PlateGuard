import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n';
import { createMemoryClient } from '../api/memory-client';
import { ServiceProvider } from '../service/ServiceProvider';
import { FloorPlanPage } from './FloorPlanPage';
import { StaffPage } from './StaffPage';

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

describe('Floor plan admin', () => {
  it('adds a table to a floor, and refuses a number that is taken', async () => {
    renderPage(<FloorPlanPage />);
    const terrace = await screen.findByRole('region', { name: 'Terrace' });
    fireEvent.click(within(terrace).getByRole('button', { name: '+ Add table' }));
    const number = within(terrace).getByLabelText('Table number');
    fireEvent.change(number, { target: { value: '1' } });
    fireEvent.click(within(terrace).getByRole('button', { name: 'Save' }));
    expect(await within(terrace).findByText('Another table already has this number.')).toBeTruthy();
    fireEvent.change(number, { target: { value: '14' } });
    fireEvent.click(within(terrace).getByRole('button', { name: 'Save' }));
    expect(await within(terrace).findByRole('button', { name: 'Edit table 14' })).toBeTruthy();
  });

  it('moves a table on the drawing and saves every table of the floor where it stands', async () => {
    const client = createMemoryClient();
    render(
      <I18nProvider locale="en">
        <ServiceProvider client={client} signedIn>
          <FloorPlanPage />
        </ServiceProvider>
      </I18nProvider>,
    );
    const terrace = await screen.findByRole('region', { name: 'Terrace' });
    const tables = within(terrace).getAllByRole('button', { name: /^Edit table/ });
    const first = tables[0]!;
    const x = Number(first.dataset.x);
    fireEvent.keyDown(first, { key: 'ArrowRight', shiftKey: true });
    await waitFor(async () => {
      const [, saved] = await client.admin.floors('demo');
      expect(saved!.tables.every((tb) => tb.position)).toBe(true);
      expect(saved!.tables[0]!.position!.x).toBe(x + 5);
    });
    expect(Number(first.dataset.x)).toBe(x + 5);
  });

  it('adds a floor', async () => {
    renderPage(<FloorPlanPage />);
    fireEvent.change(await screen.findByLabelText('New floor'), {
      target: { value: 'First floor' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('region', { name: 'First floor' })).toBeTruthy();
  });
});

describe('Staff admin', () => {
  it('unlocks a locked PIN by setting a new one', async () => {
    renderPage(<StaffPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Sam/ }));
    expect(screen.getByText(/Locked after five wrong tries/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '4321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set PIN and unlock' }));
    expect(await screen.findByText('Has a PIN for this location.')).toBeTruthy();
  });

  it('adds a cook, and does not let you change your own roles', async () => {
    renderPage(<StaffPage />);
    fireEvent.click(await screen.findByRole('button', { name: '+ New person' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Kim' } });
    fireEvent.click(screen.getByLabelText(/^Waiter/));
    fireEvent.click(screen.getByLabelText(/^Cook/));
    fireEvent.change(screen.getByLabelText(/^PIN/), { target: { value: '5678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: /Kim\s*Cook/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Demo Waiter/ }));
    expect(screen.getByText('This is you. Someone else changes your roles.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
