import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Logo } from '../components/icons';

/**
 * Every page that is not there, and every page that crashed: one calm screen in house style.
 * The error itself goes to the console only, never on screen.
 */
export function ErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();
  const missing = error == null || (isRouteErrorResponse(error) && error.status === 404);
  if (!missing) console.error(error);
  const key = missing ? 'notFound' : 'crashed';
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center bg-mist px-4">
      <Link to="/" className="mx-1 mb-6 inline-flex" aria-label="PlateGuard">
        <Logo size={36} />
      </Link>
      <h1 className="mx-1 mb-1 text-[32px] font-bold tracking-[-0.035em]">
        {t(`common:error.${key}.title`)}
      </h1>
      <p className="mx-1 mb-6 text-[15px] text-soft">{t(`common:error.${key}.lead`)}</p>
      <a
        href="/"
        className="press flex min-h-14 items-center justify-center rounded-2xl bg-brand text-[17px] font-semibold text-white"
      >
        {t('common:error.home')}
      </a>
    </div>
  );
}
