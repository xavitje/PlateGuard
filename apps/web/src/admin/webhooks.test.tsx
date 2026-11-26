import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryClient } from '../api/memory-client';
import { I18nProvider } from '../i18n';
import { ServiceProvider } from '../service/ServiceProvider';
import { WebhooksPage } from './WebhooksPage';

afterEach(cleanup);

function renderPage(client = createMemoryClient()) {
  return render(
    <I18nProvider locale="en">
      <ServiceProvider client={client} signedIn>
        <MemoryRouter>
          <WebhooksPage />
        </MemoryRouter>
      </ServiceProvider>
    </I18nProvider>,
  );
}

describe('Webhooks admin', () => {
  it('sends to Integrations while no till is linked', async () => {
    renderPage();
    expect(await screen.findByText(/No till is linked yet/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'To Integrations' })).toBeTruthy();
  });

  it('shows the webhook address and every message, with the allergy the till gave', async () => {
    const client = createMemoryClient();
    await client.admin.connectPos('demo', { accessToken: 'x'.repeat(24), squareLocationId: 'L1' });
    const [dish] = await client.admin.dishes('demo');
    await client.admin.posTestOrder('demo', {
      table: '1',
      lines: [{ dishId: dish!.id, seat: 1, note: 'notenallergie' }],
    });
    renderPage(client);
    expect(await screen.findByLabelText('Webhook URL')).toBeTruthy();
    expect(await screen.findByText('Test order')).toBeTruthy();
    expect(screen.getByText('allergy from the till: notenallergie')).toBeTruthy();
  });
});
