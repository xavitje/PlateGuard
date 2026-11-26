import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryClient } from '../api/memory-client';
import { I18nProvider } from '../i18n';
import { ServiceProvider } from '../service/ServiceProvider';
import { ProfilePage } from './ProfilePage';

afterEach(cleanup);

describe('Profile', () => {
  it('switches to another location by signing in there', async () => {
    const router = createMemoryRouter(
      [
        { path: '/profile', element: <ProfilePage /> },
        { path: '/login', element: <p>Sign-in screen</p> },
      ],
      { initialEntries: ['/profile'] },
    );
    render(
      <I18nProvider locale="en">
        <ServiceProvider client={createMemoryClient()} signedIn>
          <RouterProvider router={router} />
        </ServiceProvider>
      </I18nProvider>,
    );
    const other = await screen.findByRole('navigation', { name: 'Other locations' });
    fireEvent.click(other.querySelector('button')!);
    expect(await screen.findByText('Sign-in screen')).toBeTruthy();
    expect(router.state.location.search).toBe('?location=demo-noord');
  });
});
