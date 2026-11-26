import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { ApiError } from '../api/client';
import { useClient, useSession } from '../service/ServiceProvider';
import { deviceLocation, rememberLocation } from '../session';
import { HomeRedirect } from '../shell/HomeRedirect';

/**
 * One sign-in for everyone on a shared device: first name and PIN. The app finds the person
 * and opens where their role works. The session is bound to this location and lasts one shift.
 * A PIN locks after five wrong tries; a manager sets a new one. A new device first asks which
 * restaurant it serves (its address, or the sign-in link from Staff) and keeps it, so a PIN is
 * only ever compared with the PINs of that one restaurant.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const client = useClient();
  const session = useSession();
  const [slug, setSlug] = useState(() => deviceLocation(search));
  const [typedPlace, setPlace] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const place = useQuery({
    queryKey: ['sign-in-location', slug],
    queryFn: () => client.signInLocation(slug!),
    enabled: !!slug,
    retry: false,
  });
  const known = place.data ?? null;
  const unknownPlace = place.error instanceof ApiError && place.error.code === 'LOCATION_NOT_FOUND';
  const login = useMutation({
    mutationFn: (locationId: string) => client.loginPin({ locationId, name, pin }),
    onSuccess: (res) => {
      const here = res.me.locations[0];
      if (here) rememberLocation(here.slug);
      session.signIn(res);
    },
    onError: () => setPin(''),
  });

  if (session.signedIn) return <HomeRedirect />;

  const ready = !!known && name.trim().length > 0 && /^\d{4,6}$/.test(pin);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) login.mutate(known.location.id);
  };
  const choosePlace = (e: FormEvent) => {
    e.preventDefault();
    const typed = placeSlug(typedPlace);
    if (typed) setSlug(typed);
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
      {known && (
        <p className="mx-1 mb-5 flex items-baseline gap-2 text-sm text-soft">
          {known.location.name}
          <button
            type="button"
            onClick={() => {
              setSlug(null);
              setPlace('');
              login.reset();
            }}
            className="font-semibold text-brand underline-offset-2 hover:underline"
          >
            {t('auth:otherRestaurant')}
          </button>
        </p>
      )}

      {(!slug || unknownPlace) && (
        <form onSubmit={choosePlace} className="mt-4 grid gap-3">
          <label className="grid gap-1.5">
            <span className="mx-1.5 text-[13px] font-semibold text-soft">
              {t('auth:restaurant')}
            </span>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              maxLength={300}
              placeholder={t('auth:restaurantPlaceholder')}
              value={typedPlace}
              onChange={(e) => setPlace(e.target.value)}
              className={field}
            />
          </label>
          <p
            className={`mx-1.5 text-sm ${unknownPlace ? 'text-red' : 'text-soft'}`}
            role={unknownPlace ? 'alert' : undefined}
          >
            {unknownPlace ? t('auth:restaurantUnknown') : t('auth:restaurantHint')}
          </p>
          <button
            type="submit"
            disabled={!placeSlug(typedPlace)}
            className="press mt-1 min-h-14 rounded-2xl bg-brand text-[17px] font-semibold text-white disabled:opacity-50"
          >
            {t('auth:next')}
          </button>
        </form>
      )}

      {place.isError && !unknownPlace && (
        <p role="alert" className="mx-1 text-sm text-red">
          {t('common:loadError')}
        </p>
      )}
      {known && !known.hasStaff && (
        <p className="mx-1.5 mb-4 text-sm text-soft">{t('auth:noStaff')}</p>
      )}

      {known && (
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

/**
 * The restaurant a new device serves, from what someone typed: its address ("de-haven"), the
 * sign-in link from Staff (".../login?location=de-haven") or the guest menu link (".../menu/de-haven").
 */
export function placeSlug(typed: string): string {
  const text = typed.trim();
  const fromLink =
    /[?&]location=([^&#\s]+)/.exec(text)?.[1] ?? /\/menu\/([^/?#\s]+)/.exec(text)?.[1];
  const raw = fromLink ? decodeURIComponent(fromLink) : text;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
