import { Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMe } from '../service/ServiceProvider';
import { homeFor } from './home';

/** Sends a signed-in user to the screen for their roles, once it is known what those are. */
export function HomeRedirect() {
  const { t } = useTranslation();
  const me = useMe();
  if (me.isError) return <Navigate to="/tables" replace />;
  if (!me.data) return <p className="p-6 text-sm text-soft">{t('common:loading')}</p>;
  return <Navigate to={homeFor(me.data.locations[0]?.permissions ?? [])} replace />;
}
