import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router';
import { useCan } from '../admin/hooks';
import { ADMIN_SECTIONS } from '../shell/adminSections';
import { PageHeader } from '../shell/TabsLayout';

/**
 * Admin, inside the app frame. From a laptop up its sections sit in the sidebar under Admin;
 * on a phone or tablet they become a sticky strip at the top that scrolls sideways, with the
 * app's tab bar still at the bottom.
 */
export function AdminLayout() {
  const { t } = useTranslation();
  const can = useCan();
  const { pathname } = useLocation();
  const nav = useRef<HTMLElement>(null);
  // Keep the current section in view in the sideways strip.
  useEffect(() => {
    nav.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [pathname]);
  return (
    <>
      <nav
        ref={nav}
        aria-label={t('admin:title')}
        className="scroll-x sticky top-0 z-20 -mx-4 -mt-[max(env(safe-area-inset-top),16px)] mb-5 flex gap-1 border-b border-line bg-[color-mix(in_srgb,var(--pg-mist)_86%,transparent)] px-4 pt-[max(env(safe-area-inset-top),10px)] pb-2.5 backdrop-blur-xl backdrop-saturate-150 sm:-mx-6 sm:px-6 lg:hidden"
      >
        {ADMIN_SECTIONS.filter((s) => !s.permission || can(s.permission)).map((s) => (
          <NavLink
            key={s.slug}
            to={`/admin/${s.slug}`}
            className={({ isActive }) =>
              `flex min-h-10 shrink-0 items-center rounded-full px-3.5 text-[14.5px] whitespace-nowrap no-underline ${
                isActive ? 'bg-raised font-semibold text-ink shadow-sm' : 'text-soft active:bg-card'
              }`
            }
          >
            {t(s.key)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}

export function AdminSection() {
  const { section } = useParams();
  const { t } = useTranslation();
  const current = ADMIN_SECTIONS.find((s) => s.slug === section) ?? ADMIN_SECTIONS[0]!;
  return <PageHeader title={t(current.key)} description={t('admin:comingSoon')} />;
}
