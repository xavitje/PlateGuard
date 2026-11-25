import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useParams } from 'react-router';
import { Logo } from '../components/icons';

const SECTIONS = [
  { slug: 'recipes', key: 'admin:nav.recipes' },
  { slug: 'menus', key: 'admin:nav.menus' },
  { slug: 'floor-plan', key: 'admin:nav.floorPlan' },
  { slug: 'integrations', key: 'admin:nav.integrations' },
  { slug: 'webhooks', key: 'admin:nav.webhooks' },
  { slug: 'staff', key: 'admin:nav.staff' },
  { slug: 'dashboard', key: 'admin:nav.dashboard' },
] as const;

/** Admin: a separate desktop environment with a sidebar, not part of the three tabs. */
export function AdminLayout() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-dvh bg-bg md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-line bg-mist p-4 md:border-r">
        <div className="mb-5 flex items-center gap-2 font-semibold tracking-[-0.03em]">
          <Logo size={28} /> {t('admin:title')}
        </div>
        <nav className="flex gap-1 overflow-x-auto md:grid md:overflow-visible">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.slug}
              to={`/admin/${s.slug}`}
              className={({ isActive }) =>
                `rounded-[9px] px-3 py-2 text-[14.5px] whitespace-nowrap no-underline ${
                  isActive ? 'bg-brand-soft font-semibold text-brand-ink' : 'text-ink'
                }`
              }
            >
              {t(s.key)}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}

export function AdminSection() {
  const { section } = useParams();
  const { t } = useTranslation();
  const current = SECTIONS.find((s) => s.slug === section) ?? SECTIONS[0];
  return (
    <>
      <h1 className="mb-2 text-3xl font-semibold">{t(current.key)}</h1>
      <p className="text-soft">{t('admin:comingSoon')}</p>
    </>
  );
}
