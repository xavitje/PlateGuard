import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { createMemoryClient } from '../api/memory-client';
import { I18nProvider } from '../i18n';
import { ServiceProvider } from '../service/ServiceProvider';
import { TabsLayout } from './TabsLayout';

afterEach(cleanup);

describe('App frame', () => {
  it('keeps the app navigation when admin is open, with Admin marked as current', async () => {
    const router = createMemoryRouter(
      [
        {
          element: <TabsLayout />,
          children: [
            { path: '/tables', element: <p>Tables screen</p> },
            {
              path: '/admin',
              element: <Outlet />,
              children: [{ path: 'recipes', element: <p>Recipes screen</p> }],
            },
          ],
        },
      ],
      { initialEntries: ['/admin/recipes'] },
    );
    render(
      <I18nProvider locale="en">
        <ServiceProvider client={createMemoryClient(undefined, undefined, 'OWNER')} signedIn>
          <RouterProvider router={router} />
        </ServiceProvider>
      </I18nProvider>,
    );
    expect(await screen.findByText('Recipes screen')).toBeTruthy();
    const navs = await screen.findAllByRole('navigation', { name: 'Main menu' });
    const tabBar = navs.at(-1)!;
    const admin = await within(tabBar).findByRole('link', { name: 'Admin' });
    expect(admin.getAttribute('aria-current')).toBe('page');
    expect(within(tabBar).getByRole('link', { name: 'Tables' })).toBeTruthy();
  });
});
