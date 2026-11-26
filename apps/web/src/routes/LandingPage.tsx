import type { Outcome } from '@plateguard/domain';
import type { Locale } from '@plateguard/i18n';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Logo } from '../components/icons';
import { OutcomeBadge } from '../components/OutcomeBadge';
import { rememberLocale } from '../i18n';

/** The seeded demo location: its public guest menu is the sample. */
const SAMPLE_MENU = '/menu/de-haven-demo';

const cta =
  'press inline-flex min-h-12 items-center justify-center rounded-[14px] px-5 text-[16px] font-semibold no-underline';

/**
 * The public site at "/": what PlateGuard does for a small restaurant, and the free start.
 * House style v3 website: white, brand blue as one large surface, the product as the picture.
 */
export function LandingPage() {
  const { t, i18n } = useTranslation();
  const other: Locale = i18n.language === 'nl' ? 'en' : 'nl';
  const sample: [string, Outcome, string?][] = [
    [t('landing:hero.dish1'), 'CLEAR'],
    [t('landing:hero.dish2'), 'ADAPTABLE', t('landing:hero.dish2Why')],
    [t('landing:hero.dish3'), 'DO_NOT_SERVE'],
    [t('landing:hero.dish4'), 'UNKNOWN'],
  ];
  const steps = [1, 2, 3] as const;
  const reasons = ['nvwa', 'cost', 'calm'] as const;

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2.5 text-[19px] font-semibold tracking-[-0.03em] text-ink no-underline"
        >
          <Logo size={30} />
          PlateGuard
        </Link>
        <nav className="ml-auto flex items-center gap-x-5 gap-y-2 text-[14.5px]">
          <a href="#how" className="hidden text-soft no-underline hover:text-ink sm:inline">
            {t('landing:nav.how')}
          </a>
          <a href="#plans" className="hidden text-soft no-underline hover:text-ink sm:inline">
            {t('landing:nav.plans')}
          </a>
          <button
            type="button"
            className="text-soft hover:text-ink"
            aria-label={other === 'nl' ? 'Nederlands' : 'English'}
            onClick={() => {
              rememberLocale(other);
              void i18n.changeLanguage(other);
            }}
          >
            {other.toUpperCase()}
          </button>
          <Link to="/login" className="text-ink no-underline">
            {t('landing:nav.signIn')}
          </Link>
          <Link to="/signup" className={`${cta} min-h-10 bg-brand px-4 text-[14.5px] text-white`}>
            {t('landing:nav.start')}
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1120px] items-end gap-8 px-4 pt-8 sm:px-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:pt-14">
          <div className="pb-4 md:pb-14">
            <h1 className="mb-4 text-[clamp(34px,5vw,56px)] font-semibold tracking-[-0.04em] text-balance">
              {t('landing:hero.title')}
            </h1>
            <p className="max-w-[54ch] text-[17px] leading-relaxed text-soft">
              {t('landing:hero.lead')}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/signup" className={`${cta} bg-brand text-white`}>
                {t('landing:hero.start')}
              </Link>
              <a href={SAMPLE_MENU} className={`${cta} bg-mist text-ink`}>
                {t('landing:hero.sample')}
              </a>
            </div>
            <p className="mt-3 text-[13.5px] text-soft">{t('landing:hero.note')}</p>
          </div>
          {/* The product as the picture: the guest menu, judged for one guest. */}
          <div className="flex min-h-[300px] justify-center rounded-t-[22px] bg-brand px-5 pt-8">
            <div
              aria-hidden="true"
              className="w-full max-w-[360px] rounded-t-[18px] bg-card p-4 shadow-[0_20px_40px_-20px_rgba(0,0,40,0.5)]"
            >
              <p className="text-[12.5px] text-soft">{t('landing:hero.cardSub')}</p>
              <p className="mt-0.5 mb-2 text-[21px] font-semibold tracking-[-0.03em]">
                {t('landing:hero.cardTitle')}
              </p>
              <ul>
                {sample.map(([dish, outcome, why]) => (
                  <li
                    key={dish}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 border-b border-line py-2.5 last:border-0"
                  >
                    <span className="text-[15px] font-semibold">{dish}</span>
                    <OutcomeBadge outcome={outcome} />
                    {why && <span className="col-span-2 text-[12.5px] text-soft">{why}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="how" className="bg-mist">
          <div className="mx-auto max-w-[1120px] px-4 py-14 sm:px-6 md:py-20">
            <h2 className="text-[clamp(26px,3.4vw,36px)] font-semibold">
              {t('landing:how.title')}
            </h2>
            <p className="mt-2 mb-8 text-[17px] text-soft">{t('landing:how.lead')}</p>
            <ol className="grid gap-3 md:grid-cols-3">
              {steps.map((n) => (
                <li key={n} className="rounded-[18px] bg-card p-5 shadow-card">
                  <span className="mb-3 grid size-8 place-items-center rounded-full bg-brand-soft text-[15px] font-semibold text-brand-ink">
                    {n}
                  </span>
                  <h3 className="mb-1.5 text-[18px] font-semibold">{t(`landing:how.step${n}`)}</h3>
                  <p className="text-[15px] leading-relaxed text-soft">
                    {t(`landing:how.step${n}Text`)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-[1120px] px-4 py-14 sm:px-6 md:py-20">
          <h2 className="mb-8 max-w-[22ch] text-[clamp(26px,3.4vw,36px)] font-semibold text-balance">
            {t('landing:why.title')}
          </h2>
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-3">
            {reasons.map((r) => (
              <div key={r} className="border-t-2 border-brand pt-4">
                <h3 className="mb-1.5 text-[18px] font-semibold">{t(`landing:why.${r}`)}</h3>
                <p className="text-[15px] leading-relaxed text-soft">{t(`landing:why.${r}Text`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="plans" className="bg-mist">
          <div className="mx-auto max-w-[1120px] px-4 py-14 sm:px-6 md:py-20">
            <h2 className="mb-8 text-[clamp(26px,3.4vw,36px)] font-semibold">
              {t('landing:plans.title')}
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex flex-col rounded-[18px] bg-card p-5 shadow-[inset_0_0_0_2px_var(--pg-brand)]">
                <h3 className="text-[18px] font-semibold">{t('landing:plans.free')}</h3>
                <p className="mt-1 mb-3 text-[28px] font-semibold tracking-[-0.03em]">
                  {t('landing:plans.freePrice')}
                </p>
                <p className="mb-5 text-[15px] leading-relaxed text-soft">
                  {t('landing:plans.freeText')}
                </p>
                <Link to="/signup" className={`${cta} mt-auto bg-brand text-white`}>
                  {t('landing:plans.cta')}
                </Link>
              </div>
              {(['kitchen', 'full'] as const).map((p) => (
                <div key={p} className="rounded-[18px] bg-card p-5 shadow-card">
                  <h3 className="text-[18px] font-semibold">{t(`landing:plans.${p}`)}</h3>
                  <p className="mt-1 mb-3 text-[15px] font-semibold text-soft">
                    {t('landing:plans.onRequest')}
                  </p>
                  <p className="text-[15px] leading-relaxed text-soft">
                    {t(`landing:plans.${p}Text`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1120px] flex-wrap justify-between gap-x-6 gap-y-2 px-4 py-6 text-[12.5px] text-soft sm:px-6">
        <span>{t('landing:footer.disclaimer')}</span>
        <span>{t('landing:footer.eu')}</span>
      </footer>
    </div>
  );
}
