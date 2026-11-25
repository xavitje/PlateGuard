import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { createHttpClient } from './api/client';
import { router } from './App';
import { I18nProvider } from './i18n';
import { ServiceProvider } from './service/ServiceProvider';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ServiceProvider client={createHttpClient()}>
        <RouterProvider router={router} />
      </ServiceProvider>
    </I18nProvider>
  </StrictMode>,
);
