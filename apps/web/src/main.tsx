import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './App';
import { I18nProvider } from './i18n';
import { ServiceProvider } from './service/ServiceProvider';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ServiceProvider>
          <RouterProvider router={router} />
        </ServiceProvider>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
