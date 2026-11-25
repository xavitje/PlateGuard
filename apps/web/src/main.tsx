import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { createHttpClient } from './api/client';
import { router } from './App';
import { I18nProvider } from './i18n';
import { ServiceProvider, SIGNED_OUT_EVENT } from './service/ServiceProvider';
import { getToken } from './session';
import './styles.css';

// iOS Safari applies :active (the press feedback) only once the page has a touch listener.
document.addEventListener('touchstart', () => {}, { passive: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ServiceProvider
        client={createHttpClient(getToken, () => window.dispatchEvent(new Event(SIGNED_OUT_EVENT)))}
      >
        <RouterProvider router={router} />
      </ServiceProvider>
    </I18nProvider>
  </StrictMode>,
);
