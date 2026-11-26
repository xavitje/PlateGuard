import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createMemoryClient } from '../api/memory-client';
import { I18nProvider } from '../i18n';
import { ServiceProvider } from '../service/ServiceProvider';
import { LandingPage } from './LandingPage';
import { SignupPage } from './SignupPage';

afterEach(cleanup);

describe('Free start', () => {
  it('goes from the landing page through sign-up to Get started', async () => {
    const router = createMemoryRouter(
      [
        { path: '/', element: <LandingPage /> },
        { path: '/signup', element: <SignupPage /> },
        { path: '/admin/start', element: <p>Start screen</p> },
      ],
      { initialEntries: ['/'] },
    );
    render(
      <I18nProvider locale="en">
        <ServiceProvider
          client={createMemoryClient(undefined, undefined, 'OWNER')}
          signedIn={false}
        >
          <RouterProvider router={router} />
        </ServiceProvider>
      </I18nProvider>,
    );
    fireEvent.click((await screen.findAllByRole('link', { name: 'Start free' }))[0]!);
    const create = await screen.findByRole('button', { name: 'Create restaurant' });
    fireEvent.change(screen.getByLabelText('Restaurant name'), { target: { value: 'Bistro' } });
    fireEvent.change(screen.getByLabelText('Your first name'), { target: { value: 'Rafi' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'r@x.nl' } });
    expect(create.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Choose a PIN'), { target: { value: '48a26' } });
    fireEvent.click(create);
    expect(await screen.findByText('Start screen')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/admin/start');
  });
});
