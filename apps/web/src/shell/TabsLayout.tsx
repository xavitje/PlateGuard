import { NavLink, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertsIcon, ProfileIcon, TablesIcon } from '../components/icons';
import { DEMO_KITCHEN_EVENTS } from '../demo';
import { useService } from '../service/ServiceProvider';

/** The service app: three tabs at the bottom, nothing more is needed during service. */
export function TabsLayout() {
  const { t } = useTranslation();
  const openAlerts = useService().alerts.length + DEMO_KITCHEN_EVENTS.length;
  const tabs = [
    { to: '/tables', label: t('tables:tab'), Icon: TablesIcon, badge: 0 },
    { to: '/alerts', label: t('alerts:tab'), Icon: AlertsIcon, badge: openAlerts },
    { to: '/profile', label: t('profile:tab'), Icon: ProfileIcon, badge: 0 },
  ];

  return (
    <div className="mx-auto min-h-dvh max-w-3xl bg-mist">
      <main className="px-4 pt-[max(env(safe-area-inset-top),16px)] pb-28">
        <Outlet />
      </main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-black/5 bg-[rgba(248,249,251,0.78)] pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur-xl backdrop-saturate-150 dark:bg-[rgba(21,23,28,0.78)]"
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-3 px-2 pt-2">
          {tabs.map(({ to, label, Icon, badge }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `relative grid min-h-[48px] justify-items-center gap-0.5 py-1 text-[11px] font-medium ${
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
