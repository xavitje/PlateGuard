import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { I18nProvider } from '../i18n';
import { ErrorPage } from './ErrorPage';

function Broken(): never {
  throw new Error('secret stack detail');
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        errorElement: <ErrorPage />,
        children: [
          { path: 'broken', element: <Broken /> },
          { path: '*', element: <ErrorPage /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <I18nProvider locale="en">
      <RouterProvider router={router} />
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe('ErrorPage', () => {
  it('shows a not-found page for an unknown address', async () => {
    renderAt('/nope');
    expect(await screen.findByText('Page not found')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the start' })).toBeTruthy();
  });

  it('shows a calm page for a crash, without the error itself', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAt('/broken');
    expect(await screen.findByText('Something went wrong')).toBeTruthy();
    expect(screen.queryByText(/secret stack detail/)).toBeNull();
  });
});
