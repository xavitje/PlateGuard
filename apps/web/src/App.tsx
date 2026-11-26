import { createBrowserRouter, Navigate } from 'react-router';
import { DashboardPage } from './admin/DashboardPage';
import { FloorPlanPage } from './admin/FloorPlanPage';
import { MenuPage } from './admin/MenuPage';
import { RecipesPage } from './admin/RecipesPage';
import { IncidentsPage } from './admin/IncidentsPage';
import { IntegrationsPage } from './admin/IntegrationsPage';
import { RestaurantPage } from './admin/RestaurantPage';
import { StaffPage } from './admin/StaffPage';
import { StartPage } from './admin/StartPage';
import { AdminLayout, AdminSection } from './routes/AdminPage';
import { AlertsPage } from './routes/AlertsPage';
import { GuestMenuPage } from './routes/GuestMenuPage';
import { KitchenPage } from './routes/KitchenPage';
import { LandingPage } from './routes/LandingPage';
import { LoginPage } from './routes/LoginPage';
import { PlatformPage } from './routes/PlatformPage';
import { ProfilePage } from './routes/ProfilePage';
import { SignupPage } from './routes/SignupPage';
import { TableDetailPage } from './routes/TableDetailPage';
import { TablesPage } from './routes/TablesPage';
import { HomeRedirect } from './shell/HomeRedirect';
import { useSession } from './service/ServiceProvider';
import { TabsLayout } from './shell/TabsLayout';

/**
 * Four surfaces:
 *  - the public site at "/" (signed out) with the free start at /signup,
 *  - the app: tables, alerts, profile and admin in one frame (sidebar on a laptop, tab bar on a phone),
 *  - kitchen display, full screen without tabs (device mode),
 *  - public guest menu per location,
 *  - platform administration at /platform, for the people who run PlateGuard itself.
 */
export const router = createBrowserRouter([
  {
    element: <TabsLayout />,
    children: [
      { path: 'tables', element: <TablesPage /> },
      { path: 'tables/:label', element: <TableDetailPage /> },
      { path: 'alerts', element: <AlertsPage /> },
      { path: 'profile', element: <ProfilePage /> },
      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="recipes" replace /> },
          { path: 'start', element: <StartPage /> },
          { path: 'restaurant', element: <RestaurantPage /> },
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
  { index: true, element: <Home /> },
  { path: 'signup', element: <SignupPage /> },
  { path: 'login', element: <LoginPage /> },
  { path: 'kitchen', element: <KitchenPage /> },
  { path: 'menu/:slug', element: <GuestMenuPage /> },
  { path: 'platform', element: <PlatformPage /> },
]);

/** "/": the site for a visitor, the app for someone signed in. */
function Home() {
  return useSession().signedIn ? <HomeRedirect /> : <LandingPage />;
}
