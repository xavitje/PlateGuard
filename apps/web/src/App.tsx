import { createBrowserRouter, Navigate } from 'react-router';
import { DashboardPage } from './admin/DashboardPage';
import { FloorPlanPage } from './admin/FloorPlanPage';
import { MenuPage } from './admin/MenuPage';
import { RecipesPage } from './admin/RecipesPage';
import { IncidentsPage } from './admin/IncidentsPage';
import { IntegrationsPage } from './admin/IntegrationsPage';
import { StaffPage } from './admin/StaffPage';
import { AdminLayout, AdminSection } from './routes/AdminPage';
import { AlertsPage } from './routes/AlertsPage';
import { GuestMenuPage } from './routes/GuestMenuPage';
import { KitchenPage } from './routes/KitchenPage';
import { LoginPage } from './routes/LoginPage';
import { ProfilePage } from './routes/ProfilePage';
import { TableDetailPage } from './routes/TableDetailPage';
import { TablesPage } from './routes/TablesPage';
import { HomeRedirect } from './shell/HomeRedirect';
import { TabsLayout } from './shell/TabsLayout';

/**
 * Three surfaces:
 *  - the app: tables, alerts, profile and admin in one frame (sidebar on a laptop, tab bar on a phone),
 *  - kitchen display, full screen without tabs (device mode),
 *  - public guest menu per location.
 */
export const router = createBrowserRouter([
  {
    element: <TabsLayout />,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'tables', element: <TablesPage /> },
      { path: 'tables/:label', element: <TableDetailPage /> },
      { path: 'alerts', element: <AlertsPage /> },
      { path: 'profile', element: <ProfilePage /> },
      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="recipes" replace /> },
          { path: 'recipes', element: <RecipesPage /> },
          { path: 'menus', element: <MenuPage /> },
          { path: 'floor-plan', element: <FloorPlanPage /> },
          { path: 'staff', element: <StaffPage /> },
          { path: 'integrations', element: <IntegrationsPage /> },
          { path: 'incidents', element: <IncidentsPage /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: ':section', element: <AdminSection /> },
        ],
      },
    ],
  },
  { path: 'login', element: <LoginPage /> },
  { path: 'kitchen', element: <KitchenPage /> },
  { path: 'menu/:slug', element: <GuestMenuPage /> },
]);
