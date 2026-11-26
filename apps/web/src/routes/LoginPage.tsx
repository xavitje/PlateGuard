import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { useClient, useSession } from '../service/ServiceProvider';
import { deviceLocation, getPlatformToken, rememberLocation, setPlatformToken } from '../session';
import { platformApi } from '../api/platform';
import { HomeRedirect } from '../shell/HomeRedirect';

/**
 * One sign-in screen for everyone. Staff on a shared device type their first name and PIN: the
 * app finds the person and opens where their role works, bound to this location for one shift.
 * A PIN locks after five wrong tries; a manager sets a new one. A new device first asks which
 * restaurant it serves (its address, or the sign-in link from Staff) and keeps it, so a PIN is
 * only ever compared with the PINs of that one restaurant. Typing an email instead asks for
 * password and authenticator code: that is the platform admin, who lands on /platform.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const client = useClient();
  const session = useSession();
  const navigate = useNavigate();
  const [slug, setSlug] = useState(() => deviceLocation(search));
  const [typedPlace, setPlace] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [forgot, setForgot] = useState(false);
  const isEmail = name.includes('@');
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
  const platform = useMutation({
    mutationFn: () =>
      forgot
        ? platformApi.resetPassword({ email: name, code, password })
        : platformApi.login({ email: name, password, code }),
    onSuccess: (res) => {
      setPlatformToken(res.token);
      navigate('/platform');
    },
    onError: () => setCode(''),
  });

  if (session.signedIn) return <HomeRedirect />;
  // Already signed in to the platform on this device: straight back to it.
  if (getPlatformToken()) return <Navigate to="/platform" replace />;

  const choosing = !isEmail && (!slug || unknownPlace);
  const ready = isEmail
    ? /^\S+@\S+\.\S+$/.test(name.trim()) &&
      password.length >= (forgot ? 12 : 1) &&
      /^\d{6}$/.test(code)
    : choosing
      ? !!placeSlug(typedPlace)
      : !!known && name.trim().length > 0 && /^\d{4,6}$/.test(pin);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    if (isEmail) platform.mutate();
    else if (choosing) setSlug(placeSlug(typedPlace));
    else if (known) login.mutate(known.location.id);
  };
  const error = login.error instanceof ApiError ? login.error : null;
  const message = !error
    ? null
    : error.code === 'PIN_LOCKED'
      ? t('auth:pinLocked')
      : error.code === 'LOGIN_AMBIGUOUS'
        ? t('auth:ambiguous')
        : t('auth:pinInvalid');
  const platformError = !platform.error
    ? null
    : platform.error instanceof ApiError && platform.error.code === 'LOGIN_LOCKED'
      ? t('platform:locked')
      : platform.error instanceof ApiError && platform.error.code === 'LOGIN_INVALID'
        ? t(forgot ? 'auth:resetInvalid' : 'platform:invalid')
        : t('common:loadError');
  const field =
    'min-h-14 rounded-2xl border border-line bg-card px-4 text-[17px] outline-none focus:border-brand';
  const label = 'mx-1.5 text-[13px] font-semibold text-soft';
  const link = 'font-semibold text-brand underline-offset-2 hover:underline';

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-mist px-4 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <h1 className="mx-1 mb-1 text-[32px] font-bold tracking-[-0.035em]">{t('auth:title')}</h1>
      {known && !isEmail && (
        <p className="mx-1 mb-5 flex items-baseline gap-2 text-sm text-soft">
          {known.location.name}
          <button
            type="button"
            onClick={() => {
              setSlug(null);
              setPlace('');
              login.reset();
            }}
            className={link}
          >
            {t('auth:otherRestaurant')}
          </button>
        </p>
      )}

      <form onSubmit={submit} className="mt-4 grid gap-3">
        <label className="grid gap-1.5">
          <span className={label}>{t('auth:who')}</span>
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </label>

        {isEmail ? (
          <>
            {forgot && <p className="mx-1.5 text-sm text-soft">{t('auth:resetHint')}</p>}
            <label className="grid gap-1.5">
              <span className={label}>{t('platform:code')}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={`${field} text-center text-2xl tracking-[0.5em]`}
              />
            </label>
            <PasswordField
              label={forgot ? t('auth:newPassword') : t('platform:password')}
              isNew={forgot}
              value={password}
              onChange={setPassword}
              className={field}
              labelClass={label}
            />
            {platformError && (
              <p role="alert" className="mx-1.5 text-sm text-red">
                {platformError}
              </p>
            )}
          </>
        ) : choosing ? (
          <>
            <label className="grid gap-1.5">
              <span className={label}>{t('auth:restaurant')}</span>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
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
          </>
        ) : known ? (
          <>
            {!known.hasStaff && <p className="mx-1.5 text-sm text-soft">{t('auth:noStaff')}</p>}
            <label className="grid gap-1.5">
              <span className={label}>{t('auth:pin')}</span>
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
          </>
        ) : place.isError ? (
          <p role="alert" className="mx-1 text-sm text-red">
            {t('common:loadError')}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!ready || login.isPending || platform.isPending}
          className="press mt-1 min-h-14 rounded-2xl bg-brand text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {choosing ? t('auth:next') : forgot ? t('auth:resetPassword') : t('auth:signIn')}
        </button>
      </form>

      {isEmail ? (
        <button
          type="button"
          onClick={() => {
            setForgot(!forgot);
            setPassword('');
            platform.reset();
          }}
          className={`mx-1.5 mt-4 text-[13px] ${link}`}
        >
          {forgot ? t('auth:backToSignIn') : t('auth:forgotPassword')}
        </button>
      ) : (
        <p className="mx-1.5 mt-6 text-[12.5px] text-soft">{t('auth:shiftNote')}</p>
      )}
    </div>
  );
}

/** A password with a button to show what was typed. */
function PasswordField({
  label,
  isNew,
  value,
  onChange,
  className,
  labelClass,
}: {
  label: string;
  isNew: boolean;
  value: string;
  onChange: (v: string) => void;
  className: string;
  labelClass: string;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <label className="grid gap-1.5">
      <span className={labelClass}>{label}</span>
      <span className="relative grid">
        <input
          type={shown ? 'text' : 'password'}
          autoComplete={isNew ? 'new-password' : 'current-password'}
          minLength={isNew ? 12 : undefined}
          maxLength={200}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${className} pr-24`}
        />
        <button
          type="button"
          aria-pressed={shown}
          onClick={() => setShown(!shown)}
          className="absolute inset-y-0 right-2 my-auto h-10 rounded-[10px] px-3 text-[14px] font-semibold text-brand"
        >
          {shown ? t('auth:hidePassword') : t('auth:showPassword')}
        </button>
      </span>
      {isNew && <span className="mx-1.5 text-[12.5px] text-soft">{t('auth:passwordRule')}</span>}
    </label>
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
