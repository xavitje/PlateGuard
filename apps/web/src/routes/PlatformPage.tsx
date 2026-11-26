import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { button } from '../admin/ui';
import { ApiError } from '../api/client';
import { platformApi } from '../api/platform';
import { PlatformRestaurants } from './PlatformRestaurants';
import { PlatformStats } from './PlatformStats';
import { useSession } from '../service/ServiceProvider';
import { getPlatformToken, setPlatformToken } from '../session';

/**
 * Platform administration at /platform: for the people who run PlateGuard, apart from every
 * restaurant. Signing in is on /login with email, password and an authenticator code.
 */
export function PlatformPage() {
  const { t } = useTranslation();
  const queries = useQueryClient();
  const [token, setToken] = useState(getPlatformToken);
  const me = useQuery({
    queryKey: ['platform', 'me', token],
    queryFn: platformApi.me,
    enabled: !!token,
    retry: false,
  });
  const signOut = () => {
    setPlatformToken(null);
    setToken(null);
    queries.removeQueries({ queryKey: ['platform'] });
  };
  const expired = me.error instanceof ApiError && me.error.status === 401;
  // Back from a restaurant opened as its owner: that session ends here, on the platform.
  const { signedIn: inRestaurant, signOut: leaveRestaurant } = useSession();
  const arrivedFromRestaurant = useRef(inRestaurant);
  useEffect(() => {
    if (arrivedFromRestaurant.current) leaveRestaurant();
    arrivedFromRestaurant.current = false;
  }, [leaveRestaurant]);

  const signedIn = !!token && !expired && !!me.data;

  return (
    <div
      className={`mx-auto min-h-dvh bg-mist px-4 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)] ${signedIn ? 'max-w-6xl' : 'max-w-md'}`}
    >
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mx-1 mb-1 text-[32px] font-bold tracking-[-0.035em]">
            {t('platform:title')}
          </h1>
          <p className="mx-1 text-sm text-soft">
            {signedIn ? t('platform:signedInAs', { email: me.data.email }) : t('platform:intro')}
          </p>
        </div>
        {signedIn && (
          <button type="button" onClick={signOut} className={button}>
            {t('platform:signOut')}
          </button>
        )}
      </header>
      {!token || expired ? (
        <Navigate to="/login" replace />
      ) : signedIn ? (
        <>
          <PlatformStats />
          <PlatformRestaurants />
        </>
      ) : me.isError ? (
        <p role="alert" className="mx-1 text-sm text-red">
          {t('common:loadError')}
        </p>
      ) : null}
    </div>
  );
}
