import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router';
import { ApiError } from '../api/client';
import { useClient, useSession } from '../service/ServiceProvider';
import { deviceLocation } from '../session';

/**
 * Shared devices: pick your name, type your PIN. The session is bound to this location and
 * lasts one shift. A PIN locks after five wrong tries; a manager sets a new one.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const client = useClient();
  const session = useSession();
  const [slug] = useState(() => deviceLocation(search));
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [pin, setPin] = useState('');
  const staff = useQuery({ queryKey: ['staff', slug], queryFn: () => client.staff(slug) });
  const login = useMutation({
    mutationFn: () =>
      client.loginPin({ locationId: staff.data!.location.id, userId: person!.id, pin }),
    onSuccess: (res) => session.signIn(res),
    onError: () => setPin(''),
  });

  if (session.signedIn) return <Navigate to="/tables" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (person && /^\d{4,6}$/.test(pin)) login.mutate();
  };
  const error = login.error instanceof ApiError ? login.error : null;

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-mist px-4 pt-[max(env(safe-area-inset-top),24px)]">
      <h1 className="mx-1 mb-1 text-[32px] font-bold tracking-[-0.035em]">{t('auth:title')}</h1>
      <p className="mx-1 mb-4 text-sm text-soft">{staff.data?.location.name}</p>

      {staff.isError && (
        <p role="alert" className="mx-1 text-sm text-red">
          {staff.error instanceof ApiError && staff.error.status === 404
            ? t('auth:locationNotFound')
            : t('common:loadError')}
        </p>
      )}

      {!person && staff.data && (
        <>
          <h2 className="mx-1.5 mb-2 text-[13px] font-semibold text-soft">{t('auth:whoAreYou')}</h2>
          {staff.data.staff.length === 0 && (
            <p className="mx-1.5 text-sm text-soft">{t('auth:noStaff')}</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {staff.data.staff.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPerson(s)}
                className="press min-h-16 rounded-2xl bg-card px-3 text-left text-[15.5px] font-semibold shadow-sm"
              >
                {s.name}
              </button>
            ))}
          </div>
        </>
      )}

      {person && (
        <form onSubmit={submit} className="grid gap-3">
          <label htmlFor="pin" className="mx-1.5 text-[13px] font-semibold text-soft">
            {t('auth:enterPin', { name: person.name })}
          </label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="\d{4,6}"
            maxLength={6}
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="min-h-14 rounded-2xl border border-line bg-card px-4 text-center text-2xl tracking-[0.5em]"
          />
          {error && (
            <p role="alert" className="mx-1.5 text-sm text-red">
              {error.code === 'PIN_LOCKED'
                ? t('auth:pinLocked')
                : t('auth:pinInvalid', { triesLeft: Number(error.details.triesLeft ?? 0) })}
            </p>
          )}
          <button
            type="submit"
            disabled={pin.length < 4 || login.isPending}
            className="press min-h-14 rounded-2xl bg-brand text-[17px] font-semibold text-white disabled:opacity-50"
          >
            {t('auth:signIn')}
          </button>
          <button
            type="button"
            onClick={() => {
              setPerson(null);
              setPin('');
              login.reset();
            }}
            className="min-h-11 text-sm font-medium text-brand-ink"
          >
            {t('auth:back')}
          </button>
        </form>
      )}
      <p className="mx-1.5 mt-6 text-[12.5px] text-soft">{t('auth:shiftNote')}</p>
    </div>
  );
}
