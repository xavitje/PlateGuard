import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  AdminIcon,
  AlertsIcon,
  KitchenIcon,
  Logo,
  ProfileIcon,
  TablesIcon,
} from '../components/icons';
import { useAlerts, useMe, useSession } from '../service/ServiceProvider';
import { ADMIN_SECTIONS } from './adminSections';
import { homeFor, workspaces } from './home';

interface Place {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  badge: number;
}

/**
 * The one frame around the whole app: service, alerts, profile and admin. On a phone or tablet
 * the places sit in a tab bar at the bottom; from a laptop up they sit in a sidebar, with the
 * admin sections listed under Admin. Admin is a place in the app, not a separate site, so the
 * way back is always the same tab or sidebar entry. Only the kitchen display opens full screen.
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
  const inAdmin = pathname.startsWith('/admin');
  const tabs: Place[] = [
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
  if (me && !serves && (pathname.startsWith('/tables') || pathname.startsWith('/alerts'))) {
    const home = homeFor(permissions);
    return <Navigate to={home === '/tables' ? '/profile' : home} replace />;
  }

  return (
    <div className="min-h-dvh bg-mist lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <Sidebar places={tabs.filter((p) => p.to !== '/profile')} />
      <main
        className={`mx-auto min-w-0 px-4 pt-[max(env(safe-area-inset-top),16px)] pb-[calc(env(safe-area-inset-bottom)+96px)] sm:px-6 lg:w-full lg:px-10 lg:pt-9 lg:pb-14 ${
          inAdmin ? 'max-w-[1240px]' : 'max-w-3xl lg:max-w-[880px]'
        }`}
      >
        {me?.platformAdmin && <PlatformBanner name={me.locations[0]?.name ?? ''} />}
        <Outlet />
      </main>
      <nav
        aria-label={t('common:mainNav')}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-[color-mix(in_srgb,var(--pg-mist)_82%,transparent)] pb-[max(env(safe-area-inset-bottom),10px)] backdrop-blur-xl backdrop-saturate-150 lg:hidden"
      >
        <ul
          className="mx-auto grid max-w-3xl px-2 pt-1.5"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map(({ to, label, Icon, badge }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `press relative grid min-h-[50px] justify-items-center gap-0.5 py-1 text-[11px] font-medium no-underline ${
                    isActive ? 'text-brand-ink' : 'text-soft'
                  }`
                }
              >
                <Icon width={24} height={24} />
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

const sideLink = (active: boolean) =>
  `flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-[14.5px] no-underline transition-colors duration-150 ${
    active ? 'bg-brand-soft font-semibold text-brand-ink' : 'text-ink hover:bg-mist active:bg-mist'
  }`;

function Sidebar({ places }: { places: Place[] }) {
  const { t } = useTranslation();
  const me = useMe().data;
  const { pathname } = useLocation();
  const permissions = me?.locations[0]?.permissions ?? [];
  const sections = ADMIN_SECTIONS.filter(
    (s) => !s.permission || permissions.includes(s.permission),
  );
  const initials = (me?.user.name ?? '')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-card px-3 pt-5 pb-3 lg:flex">
      <Link to="/" className="mb-6 flex items-center gap-2.5 px-2 text-ink no-underline">
        <Logo size={30} />
        <span className="grid leading-tight">
          <span className="text-[15.5px] font-semibold tracking-[-0.02em]">PlateGuard</span>
          {me?.locations[0] && (
            <span className="truncate text-[12.5px] text-soft">{me.locations[0].name}</span>
          )}
        </span>
      </Link>

      <nav
        aria-label={t('common:mainNav')}
        className="grid min-h-0 flex-1 content-start gap-0.5 overflow-y-auto"
      >
        {places.map(({ to, label, Icon, badge }) =>
          to === '/admin' ? (
            <AdminGroup key={to} label={label} sections={sections} pathname={pathname} />
          ) : (
            <NavLink key={to} to={to} className={({ isActive }) => sideLink(isActive)}>
              <Icon width={20} height={20} className="shrink-0" />
              <span className="flex-1">{label}</span>
              {badge > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red px-1.5 text-[11px] font-bold text-white">
                  {badge}
                </span>
              )}
            </NavLink>
          ),
        )}
      </nav>

      <NavLink
        to="/profile"
        className={({ isActive }) =>
          `mt-2 flex min-h-12 items-center gap-3 rounded-[12px] px-2 no-underline ${
            isActive ? 'bg-brand-soft text-brand-ink' : 'text-ink hover:bg-mist'
          }`
        }
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-mist text-[12px] font-semibold text-soft"
        >
          {initials || <ProfileIcon width={18} height={18} />}
        </span>
        <span className="grid min-w-0 leading-tight">
          <span className="truncate text-[14px] font-medium">
            {me?.user.name ?? t('profile:tab')}
          </span>
          <span className="text-[12.5px] text-soft">{t('profile:tab')}</span>
        </span>
      </NavLink>
    </aside>
  );
}

function AdminGroup({
  label,
  sections,
  pathname,
}: {
  label: string;
  sections: typeof ADMIN_SECTIONS;
  pathname: string;
}) {
  const { t } = useTranslation();
  const open = pathname.startsWith('/admin');
  return (
    <div className="mt-4 grid gap-0.5 border-t border-line pt-4">
      <Link
        to="/admin"
        aria-current={open && pathname === '/admin' ? 'page' : undefined}
        className={`flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-[14.5px] no-underline ${
          open ? 'font-semibold text-ink' : 'text-ink hover:bg-mist'
        }`}
      >
        <AdminIcon width={20} height={20} className="shrink-0" />
        {label}
      </Link>
      <ul className="grid gap-0.5">
        {sections.map((s) => (
          <li key={s.slug}>
            <NavLink
              to={`/admin/${s.slug}`}
              className={({ isActive }) =>
                `flex min-h-9 items-center rounded-[10px] pr-3 pl-[44px] text-[14px] no-underline transition-colors duration-150 ${
                  isActive
                    ? 'bg-brand-soft font-semibold text-brand-ink'
                    : 'text-soft hover:bg-mist hover:text-ink'
                }`
              }
            >
              {t(s.key)}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The title of a screen, with an optional line under it and actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 lg:mb-7">
      <div className="grid min-w-0 gap-1.5">
        {back}
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] lg:text-[30px]">{title}</h1>
        {description && (
          <p className="max-w-[62ch] text-[15px] leading-relaxed text-soft">{description}</p>
        )}
      </div>
      {actions}
    </header>
  );
}

export function PageTitle({ children }: { children: string }) {
  return <PageHeader title={children} />;
}

/** While a platform admin works in a restaurant as its owner: say so, and the way back. */
function PlatformBanner({ name }: { name: string }) {
  const { t } = useTranslation();
  const { signOut } = useSession();
  const navigate = useNavigate();
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-brand-soft px-4 py-2.5 text-[14px] text-brand-ink"
    >
      <span>{t('platform:viewing', { name })}</span>
      <button
        type="button"
        className="press min-h-10 rounded-[10px] bg-card px-3 font-semibold"
        onClick={() => {
          navigate('/platform');
          signOut();
        }}
      >
        {t('platform:backToPlatform')}
      </button>
    </div>
  );
}
