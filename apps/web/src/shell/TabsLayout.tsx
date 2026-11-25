import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AdminIcon, AlertsIcon, KitchenIcon, ProfileIcon, TablesIcon } from '../components/icons';
import { useAlerts, useMe, useSession } from '../service/ServiceProvider';
import { homeFor, workspaces } from './home';

/**
 * The service app: tabs at the bottom for what this user's roles allow. Tables and alerts for
 * whoever serves; the kitchen and admin open full screen, so cooks and managers find them here
 * without knowing their address.
 */
export function TabsLayout() {
  const { t } = useTranslation();
  const { signedIn } = useSession();
  const { pathname } = useLocation();
  const me = useMe().data;
  const permissions = me?.locations[0]?.permissions ?? [];
  const places = workspaces(permissions);
  const serves = !me || places.includes('tables');
  const openAlerts = useAlerts(serves).data?.filter((a) => !a.read).length ?? 0;
  const tabs = [
    ...(serves
      ? [
          { to: '/tables', label: t('tables:tab'), Icon: TablesIcon, badge: 0 },
          { to: '/alerts', label: t('alerts:tab'), Icon: AlertsIcon, badge: openAlerts },
        ]
      : []),
    ...(places.includes('kitchen')
      ? [{ to: '/kitchen', label: t('kitchen:tab'), Icon: KitchenIcon, badge: 0 }]
      : []),
    ...(places.includes('admin')
      ? [{ to: '/admin', label: t('admin:tab'), Icon: AdminIcon, badge: 0 }]
      : []),
    { to: '/profile', label: t('profile:tab'), Icon: ProfileIcon, badge: 0 },
  ];

  if (!signedIn) return <Navigate to="/login" replace />;
  // A cook has no tables: send them to their own screen instead of an error.
  if (me && !serves && pathname !== '/profile') {
    const home = homeFor(permissions);
    return <Navigate to={home === '/tables' ? '/profile' : home} replace />;
  }

  return (
    <div className="mx-auto min-h-dvh max-w-3xl bg-mist">
      <main className="px-4 pt-[max(env(safe-area-inset-top),16px)] pb-[calc(env(safe-area-inset-bottom)+96px)]">
        <Outlet />
      </main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-black/5 bg-[rgba(248,249,251,0.78)] pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur-xl backdrop-saturate-150 dark:bg-[rgba(21,23,28,0.78)]"
      >
        <ul
          className="mx-auto grid max-w-3xl px-2 pt-2"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map(({ to, label, Icon, badge }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `press relative grid min-h-[48px] justify-items-center gap-0.5 py-1 text-[11px] font-medium no-underline ${
                    isActive ? 'text-brand-ink' : 'text-[#8a909c]'
                  }`
                }
              >
                <Icon width={25} height={25} />
                {label}
                {badge > 0 && (
                  <span className="absolute top-0 left-[calc(50%+6px)] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red px-1.5 text-[10.5px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function PageTitle({ children }: { children: string }) {
  return <h1 className="mx-1 mt-2 mb-3 text-[32px] font-bold tracking-[-0.035em]">{children}</h1>;
}
