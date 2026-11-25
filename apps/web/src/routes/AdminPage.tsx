import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useParams } from 'react-router';
import { ChevronLeft, Logo } from '../components/icons';
import type { Permission } from '@plateguard/domain';
import { useCan } from '../admin/hooks';
import { useSession } from '../service/ServiceProvider';

const SECTIONS: { slug: string; key: string; permission?: Permission }[] = [
  { slug: 'recipes', key: 'admin:nav.recipes', permission: 'menu.edit' },
  { slug: 'menus', key: 'admin:nav.menus', permission: 'menu.edit' },
  { slug: 'floor-plan', key: 'admin:nav.floorPlan', permission: 'floorplan.edit' },
  { slug: 'integrations', key: 'admin:nav.integrations', permission: 'integrations.manage' },
  { slug: 'webhooks', key: 'admin:nav.webhooks' },
  { slug: 'staff', key: 'admin:nav.staff', permission: 'staff.manage' },
  { slug: 'incidents', key: 'admin:nav.incidents', permission: 'incident.manage' },
  { slug: 'dashboard', key: 'admin:nav.dashboard' },
];

/**
 * Admin: a separate environment, not part of the three tabs. On a desktop the sections sit in a
 * sidebar; on a phone they become a sticky strip of tabs under the header that scrolls sideways.
 * The back link returns to the service app, where admin is opened from Profile.
 */
export function AdminLayout() {
  const { t } = useTranslation();
  const { signedIn } = useSession();
  const can = useCan();
  const { pathname } = useLocation();
  const nav = useRef<HTMLElement>(null);
  // Keep the current section in view in the sideways strip.
  useEffect(() => {
    nav.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [pathname]);
  if (!signedIn) return <Navigate to="/login" replace />;
  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] bg-bg md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-20 border-b border-line bg-[rgba(244,245,247,0.86)] pt-[max(env(safe-area-inset-top),8px)] backdrop-blur-xl backdrop-saturate-150 md:h-dvh md:overflow-y-auto md:border-r md:border-b-0 md:bg-mist md:p-4 md:pt-[max(env(safe-area-inset-top),16px)] dark:bg-[rgba(21,23,28,0.86)] md:dark:bg-mist">
        <div className="flex items-center justify-between gap-3 px-3 md:mb-5 md:grid md:justify-start md:gap-3 md:px-0">
          <Link
            to="/profile"
            className="-ml-1 inline-flex min-h-11 items-center gap-0.5 pr-2 font-medium text-brand-ink no-underline md:-ml-1.5 md:min-h-9"
          >
            <ChevronLeft width={20} height={20} />
            {t('admin:back')}
          </Link>
          <div className="flex items-center gap-2 font-semibold tracking-[-0.03em] md:order-first">
            <Logo size={26} /> {t('admin:title')}
          </div>
        </div>
        <nav
          ref={nav}
          aria-label={t('admin:title')}
          className="scroll-x flex gap-1 px-3 pt-1 pb-2.5 md:grid md:overflow-visible md:p-0"
        >
          {SECTIONS.filter((s) => !s.permission || can(s.permission)).map((s) => (
            <NavLink
              key={s.slug}
              to={`/admin/${s.slug}`}
              className={({ isActive }) =>
                `flex min-h-10 shrink-0 items-center rounded-full px-3.5 text-[14.5px] whitespace-nowrap no-underline md:rounded-[9px] md:px-3 ${
                  isActive
                    ? 'bg-brand-soft font-semibold text-brand-ink'
                    : 'text-ink active:bg-black/5 dark:active:bg-white/5'
                }`
              }
            >
              {t(s.key)}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 px-4 pt-5 pb-[max(env(safe-area-inset-bottom),32px)] md:p-6">
        <Outlet />
      </main>
    </div>
  );
}

export function AdminSection() {
  const { section } = useParams();
  const { t } = useTranslation();
  const current = SECTIONS.find((s) => s.slug === section) ?? SECTIONS[0]!;
  return (
    <>
      <h1 className="mb-2 text-3xl font-semibold">{t(current.key)}</h1>
      <p className="text-soft">{t('admin:comingSoon')}</p>
    </>
  );
}
