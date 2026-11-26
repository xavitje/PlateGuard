import { SUPPORTED_LOCALES, type Locale } from '@plateguard/i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Link } from 'react-router';
import { input } from '../admin/ui';
import { segmentItem, segmentTrack } from '../components/segment';
import { rememberLocale } from '../i18n';
import { useMe, useSession } from '../service/ServiceProvider';
import { workspaces, WORKSPACE_PATH } from '../shell/home';
import { PageTitle } from '../shell/TabsLayout';
import { applyTheme, storedTheme, THEMES, type Theme } from '../theme';

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const me = useMe().data;
  const { signOut } = useSession();
  const places = workspaces(me?.locations[0]?.permissions ?? []);
  const choose = (code: Locale) => {
    rememberLocale(code);
    void i18n.changeLanguage(code);
  };
  const [theme, setTheme] = useState(storedTheme);
  const chooseTheme = (th: Theme) => {
    applyTheme(th);
    setTheme(th);
  };

  const row =
    'flex min-h-12 w-full items-center justify-between border-b border-line py-3 text-left text-[15.5px] last:border-b-0';

  return (
    <>
      <PageTitle>{t('profile:title')}</PageTitle>
      {me && (
        <p className="mx-1.5 mb-2 text-sm text-soft">
          {t('profile:signedInAs', { name: me.user.name })} · {me.locations[0]?.name}
        </p>
      )}

      <h2 className="mx-1.5 mt-4 mb-2 text-[13px] font-semibold tracking-normal text-soft">
        {t('profile:appearance')}
      </h2>
      <div role="radiogroup" aria-label={t('profile:appearance')} className={segmentTrack}>
        {THEMES.map((th) => (
          <button
            key={th}
            type="button"
            role="radio"
            aria-checked={theme === th}
            onClick={() => chooseTheme(th)}
            className={segmentItem(theme === th)}
          >
            {t(`profile:themes.${th}`)}
          </button>
        ))}
      </div>

      <label
        htmlFor="profile-language"
        className="mx-1.5 mt-4 mb-2 block text-[13px] font-semibold tracking-normal text-soft"
      >
        {t('profile:language')}
      </label>
      <select
        id="profile-language"
        className={input}
        value={i18n.language}
        onChange={(e) => choose(e.target.value as Locale)}
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
      <p className="mx-1.5 mt-2 text-[13px] text-soft">{t('profile:languageNote')}</p>

      {places.length > 1 && (
        // From a laptop up the sidebar already lists these places.
        <div className="lg:hidden">
          <h2 className="mx-1.5 mt-4 mb-2 text-[13px] font-semibold tracking-normal text-soft">
            {t('profile:workplace')}
          </h2>
          <nav aria-label={t('profile:workplace')} className="rounded-[18px] bg-card px-3.5">
            {places.map((w) => (
              <Link key={w} to={WORKSPACE_PATH[w]} className={`${row} text-ink no-underline`}>
                <span className="grid">
                  {t(`profile:places.${w}.name`)}
                  <span className="text-[13px] text-soft">{t(`profile:places.${w}.hint`)}</span>
                </span>
                <span aria-hidden className="text-soft">
                  ›
                </span>
              </Link>
            ))}
          </nav>
        </div>
      )}

      <section className="mt-4 rounded-[18px] bg-card px-3.5">
        <button className={row} type="button" onClick={signOut}>
          {t('profile:switchUser')}
        </button>
        <button className={`${row} text-red`} type="button" onClick={signOut}>
          {t('profile:signOut')}
        </button>
      </section>
    </>
  );
}
