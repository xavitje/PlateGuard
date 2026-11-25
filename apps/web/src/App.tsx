import { createBrowserRouter, Navigate } from 'react-router';
import { AdminLayout, AdminSection } from './routes/AdminPage';
import { AlertsPage } from './routes/AlertsPage';
import { GuestMenuPage } from './routes/GuestMenuPage';
import { KitchenPage } from './routes/KitchenPage';
import { LoginPage } from './routes/LoginPage';
import { ProfilePage } from './routes/ProfilePage';
import { TableDetailPage } from './routes/TableDetailPage';
import { TablesPage } from './routes/TablesPage';
import { TabsLayout } from './shell/TabsLayout';

/**
 * Four separate surfaces:
 *  - service app with three tabs (phone and tablet),
 *  - kitchen display, full screen without tabs (device mode),
 *  - admin, desktop with a sidebar,
 *  - public guest menu per location.
 */
export const router = createBrowserRouter([
  {
    element: <TabsLayout />,
    children: [
      { index: true, element: <Navigate to="/tables" replace /> },
      { path: 'tables', element: <TablesPage /> },
      { path: 'tables/:label', element: <TableDetailPage /> },
      { path: 'alerts', element: <AlertsPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },
  { path: 'login', element: <LoginPage /> },
  { path: 'kitchen', element: <KitchenPage /> },
  {
    path: 'admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <Navigate to="recipes" replace /> },
      { path: ':section', element: <AdminSection /> },
    ],
  },
  { path: 'menu/:slug', element: <GuestMenuPage /> },
]);
