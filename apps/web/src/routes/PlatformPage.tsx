import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { button } from '../admin/ui';
import { ApiError } from '../api/client';
import { platformApi } from '../api/platform';
import { PlatformRestaurants } from './PlatformRestaurants';
import { getPlatformToken, setPlatformToken } from '../session';

const field =
  'min-h-14 rounded-2xl border border-line bg-card px-4 text-[17px] outline-none focus:border-brand';
const primary =
  'press mt-1 min-h-14 rounded-2xl bg-brand text-[17px] font-semibold text-white disabled:opacity-50';

/**
 * Platform administration at /platform: for the people who run PlateGuard, apart from every
 * restaurant. Email, password and an authenticator code; never first name and PIN.
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
        <PlatformLogin
          onSignedIn={(next) => {
            setPlatformToken(next);
            setToken(next);
          }}
        />
      ) : signedIn ? (
        <PlatformRestaurants />
      ) : me.isError ? (
        <p role="alert" className="mx-1 text-sm text-red">
          {t('common:loadError')}
        </p>
      ) : null}
    </div>
  );
}

function PlatformLogin({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const login = useMutation({
    mutationFn: () => platformApi.login({ email, password, code }),
    onSuccess: (res) => onSignedIn(res.token),
    onError: () => setCode(''),
  });
  const ready = email.includes('@') && password.length > 0 && /^\d{6}$/.test(code);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) login.mutate();
  };
  const error = login.error instanceof ApiError ? login.error : login.error ? true : null;
  return (
    <form onSubmit={submit} className="grid gap-3">
      <label className="grid gap-1.5">
        <span className="mx-1.5 text-[13px] font-semibold text-soft">{t('platform:email')}</span>
        <input
          type="email"
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
      </label>
      <label className="grid gap-1.5">
        <span className="mx-1.5 text-[13px] font-semibold text-soft">{t('platform:password')}</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
        />
      </label>
      <label className="grid gap-1.5">
        <span className="mx-1.5 text-[13px] font-semibold text-soft">{t('platform:code')}</span>
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
      {error && (
        <p role="alert" className="mx-1.5 text-sm text-red">
          {error instanceof ApiError && error.code === 'LOGIN_LOCKED'
            ? t('platform:locked')
            : error instanceof ApiError && error.code === 'LOGIN_INVALID'
              ? t('platform:invalid')
              : t('common:loadError')}
        </p>
      )}
      <button type="submit" disabled={!ready || login.isPending} className={primary}>
        {t('platform:signIn')}
      </button>
    </form>
  );
}
