import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { Logo } from '../components/icons';
import { useClient, useSession } from '../service/ServiceProvider';
import { rememberLocation } from '../session';

/**
 * The free start: restaurant name, the owner's first name, email and PIN. The owner is signed
 * in at once and continues with "Get started" in admin.
 */
export function SignupPage() {
  const { t } = useTranslation();
  const client = useClient();
  const session = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ restaurant: '', name: '', email: '', pin: '' });
  const signup = useMutation({
    mutationFn: () => client.signup(form),
    onSuccess: (res) => {
      const here = res.me.locations[0];
      if (here) rememberLocation(here.slug);
      session.signIn(res);
      void navigate('/admin/start', { replace: true });
    },
  });

  // Already signed in when arriving here: the app, not a second restaurant.
  if (session.signedIn && signup.isIdle) return <Navigate to="/" replace />;

  const ready =
    form.restaurant.trim().length >= 2 &&
    form.name.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(form.email) &&
    /^\d{4,6}$/.test(form.pin);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) signup.mutate();
  };
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const error = signup.error
    ? signup.error instanceof ApiError && signup.error.code === 'EMAIL_TAKEN'
      ? t('landing:signup.emailTaken')
      : t('landing:signup.error')
    : null;
  const field =
    'min-h-14 rounded-2xl border border-line bg-card px-4 text-[17px] outline-none focus:border-brand';
  const label = 'mx-1.5 text-[13px] font-semibold text-soft';

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-mist px-4 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <Link to="/" className="mx-1 mb-6 inline-flex" aria-label="PlateGuard">
        <Logo size={36} />
      </Link>
      <h1 className="mx-1 mb-1 text-[32px] font-bold tracking-[-0.035em]">
        {t('landing:signup.title')}
      </h1>
      <p className="mx-1 mb-5 text-[15px] text-soft">{t('landing:signup.lead')}</p>

      <form onSubmit={submit} className="grid gap-3">
        <label className="grid gap-1.5">
          <span className={label}>{t('landing:signup.restaurant')}</span>
          <input
            type="text"
            autoComplete="organization"
            autoFocus
            maxLength={120}
            value={form.restaurant}
            onChange={(e) => set('restaurant')(e.target.value)}
            className={field}
          />
        </label>
        <label className="grid gap-1.5">
          <span className={label}>{t('landing:signup.name')}</span>
          <input
            type="text"
            autoComplete="given-name"
            autoCapitalize="words"
            maxLength={80}
            value={form.name}
            onChange={(e) => set('name')(e.target.value)}
            className={field}
          />
        </label>
        <label className="grid gap-1.5">
          <span className={label}>{t('landing:signup.email')}</span>
          <input
            type="email"
            autoComplete="email"
            maxLength={200}
            value={form.email}
            onChange={(e) => set('email')(e.target.value)}
            className={field}
          />
        </label>
        <label className="grid gap-1.5">
          <span className={label}>{t('landing:signup.pin')}</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="\d{4,6}"
            maxLength={6}
            value={form.pin}
            onChange={(e) => set('pin')(e.target.value.replace(/\D/g, ''))}
            className={`${field} text-center text-2xl tracking-[0.5em]`}
            aria-describedby="pin-hint"
          />
        </label>
        <span id="pin-hint" className="mx-1.5 -mt-1.5 text-[12.5px] text-soft">
          {t('landing:signup.pinHint')}
        </span>
        {error && (
          <p role="alert" className="mx-1.5 text-sm text-red">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!ready || signup.isPending}
          className="press mt-1 min-h-14 rounded-2xl bg-brand text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {t('landing:signup.submit')}
        </button>
      </form>
      <p className="mx-1.5 mt-5 text-[13.5px] text-soft">{t('landing:signup.terms')}</p>
      <p className="mx-1.5 mt-3 text-[14px]">
        {t('landing:signup.haveAccount')}{' '}
        <Link to="/login" className="text-brand-ink">
          {t('landing:nav.signIn')}
        </Link>
      </p>
    </div>
  );
}
