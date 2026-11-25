import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { ApiError } from '../api/client';
import { useClient, useSession } from '../service/ServiceProvider';
import { deviceLocation } from '../session';
import { HomeRedirect } from '../shell/HomeRedirect';

/**
 * One sign-in for everyone on a shared device: first name and PIN. The app finds the person
 * and opens where their role works. The session is bound to this location and lasts one shift.
 * A PIN locks after five wrong tries; a manager sets a new one.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const client = useClient();
  const session = useSession();
  const [slug] = useState(() => deviceLocation(search));
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const place = useQuery({
    queryKey: ['sign-in-location', slug],
    queryFn: () => client.signInLocation(slug),
  });
  const login = useMutation({
    mutationFn: () => client.loginPin({ locationId: place.data!.location.id, name, pin }),
    onSuccess: (res) => session.signIn(res),
    onError: () => setPin(''),
  });

  if (session.signedIn) return <HomeRedirect />;

  const ready = !!place.data && name.trim().length > 0 && /^\d{4,6}$/.test(pin);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) login.mutate();
  };
  const error = login.error instanceof ApiError ? login.error : null;
  const message = !error
    ? null
    : error.code === 'PIN_LOCKED'
      ? t('auth:pinLocked')
      : error.code === 'NAME_UNKNOWN'
        ? t('auth:nameUnknown')
        : error.code === 'LOGIN_AMBIGUOUS'
          ? t('auth:ambiguous')
          : t('auth:pinInvalid', { triesLeft: Number(error.details.triesLeft ?? 0) });
  const field =
    'min-h-14 rounded-2xl border border-line bg-card px-4 text-[17px] outline-none focus:border-brand';

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-mist px-4 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <h1 className="mx-1 mb-1 text-[32px] font-bold tracking-[-0.035em]">{t('auth:title')}</h1>
      <p className="mx-1 mb-5 text-sm text-soft">{place.data?.location.name}</p>

      {place.isError && (
        <p role="alert" className="mx-1 text-sm text-red">
          {place.error instanceof ApiError && place.error.status === 404
            ? t('auth:locationNotFound')
            : t('common:loadError')}
        </p>
      )}
      {place.data && !place.data.hasStaff && (
        <p className="mx-1.5 mb-4 text-sm text-soft">{t('auth:noStaff')}</p>
      )}

      {place.data && (
        <form onSubmit={submit} className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="mx-1.5 text-[13px] font-semibold text-soft">
              {t('auth:firstName')}
            </span>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
              autoFocus
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="mx-1.5 text-[13px] font-semibold text-soft">{t('auth:pin')}</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="\d{4,6}"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className={`${field} text-center text-2xl tracking-[0.5em]`}
            />
          </label>
          {message && (
            <p role="alert" className="mx-1.5 text-sm text-red">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={!ready || login.isPending}
            className="press mt-1 min-h-14 rounded-2xl bg-brand text-[17px] font-semibold text-white disabled:opacity-50"
          >
            {t('auth:signIn')}
          </button>
        </form>
      )}
      <p className="mx-1.5 mt-6 text-[12.5px] text-soft">{t('auth:shiftNote')}</p>
    </div>
  );
}
