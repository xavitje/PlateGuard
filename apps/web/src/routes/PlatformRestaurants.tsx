import { PLANS, type Plan, type PlatformRestaurant, type StaffMember } from '@plateguard/contracts';
import { ROLES, type Role } from '@plateguard/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, input, MasterDetail, primary, SaveError, button } from '../admin/ui';
import { platformApi } from '../api/platform';

const RESTAURANTS = ['platform', 'restaurants'];
const STATS = ['platform', 'stats'];
const pinOk = (pin: string) => /^\d{4,6}$/.test(pin);

/** Every restaurant: make one on request, set its plan, and manage its people. */
export function PlatformRestaurants() {
  const { t } = useTranslation();
  const list = useQuery({ queryKey: RESTAURANTS, queryFn: platformApi.restaurants });
  const [selected, setSelected] = useState<string | null>(null);
  const rows = list.data ?? [];
  const current = rows.find((r) => r.id === selected);
  return (
    <>
      <h2 className="mb-3 text-[22px] font-bold tracking-[-0.02em]">{t('platform:restaurants')}</h2>
      {list.isError && <SaveError error={list.error} />}
      <MasterDetail
        items={rows.map((r) => ({
          id: r.id,
          name: r.name,
          meta: (
            <span className="text-[12.5px] font-normal text-soft">
              {t(`platform:plans.${r.plan}`, { defaultValue: r.plan })}
            </span>
          ),
        }))}
        selected={selected}
        onSelect={setSelected}
        onNew={() => setSelected('new')}
        newLabel={t('platform:newRestaurant')}
        detail={
          selected === 'new' ? (
            <NewRestaurant
              onDone={(next) =>
                setSelected(next.find((r) => !rows.some((o) => o.id === r.id))?.id ?? null)
              }
            />
          ) : current ? (
            <Restaurant key={current.id} restaurant={current} />
          ) : (
            <p className="text-soft">{t('platform:pick')}</p>
          )
        }
      />
    </>
  );
}

function NewRestaurant({ onDone }: { onDone: (list: PlatformRestaurant[]) => void }) {
  const { t } = useTranslation();
  const queries = useQueryClient();
  const [restaurant, setRestaurant] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [plan, setPlan] = useState<Plan>('free');
  const create = useMutation({
    mutationFn: () => platformApi.createRestaurant({ restaurant, name, email, pin, plan }),
    onSuccess: (list) => {
      queries.setQueryData(RESTAURANTS, list);
      void queries.invalidateQueries({ queryKey: STATS });
      onDone(list);
    },
  });
  const ready = restaurant.trim().length >= 2 && name.trim() && email.includes('@') && pinOk(pin);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) create.mutate();
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      <h3 className="text-[18px] font-semibold">{t('platform:newRestaurant')}</h3>
      <Field label={t('platform:restaurantName')}>
        <input
          className={input}
          value={restaurant}
          onChange={(e) => setRestaurant(e.target.value)}
        />
      </Field>
      <Field label={t('platform:ownerName')}>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t('platform:ownerEmail')}>
        <input
          type="email"
          className={input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label={t('platform:ownerPin')} hint={t('platform:ownerPinHint')}>
        <input
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          className={input}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
      </Field>
      <PlanSelect value={plan} onChange={setPlan} />
      <SaveError error={create.error} />
      <button type="submit" className={primary} disabled={!ready || create.isPending}>
        {t('platform:create')}
      </button>
    </form>
  );
}

function PlanSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (p: Plan) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Field label={t('platform:plan')}>
      <select
        className={input}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Plan)}
      >
        {[...(PLANS.includes(value as Plan) ? [] : [value]), ...PLANS].map((p) => (
          <option key={p} value={p}>
            {t(`platform:plans.${p}`, { defaultValue: p })}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Restaurant({ restaurant }: { restaurant: PlatformRestaurant }) {
  const { t, i18n } = useTranslation();
  const queries = useQueryClient();
  const plan = useMutation({
    mutationFn: (p: Plan) => platformApi.setPlan(restaurant.id, p),
    onSuccess: (list) => {
      queries.setQueryData(RESTAURANTS, list);
      void queries.invalidateQueries({ queryKey: STATS });
    },
  });
  return (
    <div className="grid gap-5">
      <div>
        <h3 className="text-[20px] font-semibold">{restaurant.name}</h3>
        <p className="text-[13.5px] text-soft">
          {t('platform:since', {
            date: new Date(restaurant.createdAt).toLocaleDateString(i18n.language),
          })}{' '}
          ·{' '}
          {restaurant.ownerEmail
            ? t('platform:contact', { email: restaurant.ownerEmail })
            : t('platform:noContact')}
        </p>
        <p className="text-[13.5px] text-soft">
          {t('platform:plates30', { count: restaurant.plates30 })} ·{' '}
          {restaurant.lastActivity
            ? t('platform:lastActivity', {
                date: new Date(restaurant.lastActivity).toLocaleDateString(i18n.language),
              })
            : t('platform:noActivity')}
        </p>
      </div>
      <PlanSelect
        value={restaurant.plan}
        onChange={(p) => plan.mutate(p)}
        disabled={plan.isPending}
      />
      <SaveError error={plan.error} />
      {restaurant.locations.map((l) => (
        <LocationPeople key={l.id} location={l} />
      ))}
    </div>
  );
}

function LocationPeople({ location }: { location: PlatformRestaurant['locations'][number] }) {
  const { t } = useTranslation();
  const queries = useQueryClient();
  const key = ['platform', 'staff', location.id];
  const staff = useQuery({ queryKey: key, queryFn: () => platformApi.staff(location.id) });
  const saved = (list: StaffMember[]) => {
    queries.setQueryData(key, list);
    void queries.invalidateQueries({ queryKey: RESTAURANTS });
    void queries.invalidateQueries({ queryKey: STATS });
  };
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('WAITER');
  const [pin, setPin] = useState('');
  const add = useMutation({
    mutationFn: () => platformApi.addStaff(location.id, { name, roles: [role], pin }),
    onSuccess: (list) => {
      saved(list);
      setName('');
      setPin('');
    },
  });
  const link = `${window.location.origin}/login?location=${location.slug}`;
  return (
    <section className="grid gap-3 border-t border-line pt-4">
      <div>
        <h4 className="text-[16px] font-semibold">{location.name}</h4>
        <p className="text-[13px] text-soft">
          {t('platform:signInLink')}:{' '}
          <span className="font-mono break-all text-ink select-all">{link}</span>
        </p>
      </div>
      <h5 className="text-[13.5px] font-medium text-soft">{t('platform:people')}</h5>
      <SaveError error={staff.error} />
      <ul className="grid gap-2">
        {(staff.data ?? []).map((m) => (
          <Person key={m.id} locationId={location.id} member={m} onSaved={saved} />
        ))}
      </ul>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_auto_8rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && pinOk(pin)) add.mutate();
        }}
      >
        <Field label={t('platform:firstName')}>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('platform:role')}>
          <select className={input} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`admin:staff.roles.${r}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('platform:pin')}>
          <input
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            className={input}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <button
          type="submit"
          className={button}
          disabled={!name.trim() || !pinOk(pin) || add.isPending}
        >
          {t('platform:add')}
        </button>
      </form>
      <SaveError error={add.error} />
    </section>
  );
}

function Person({
  locationId,
  member,
  onSaved,
}: {
  locationId: string;
  member: StaffMember;
  onSaved: (list: StaffMember[]) => void;
}) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const set = useMutation({
    mutationFn: () => platformApi.setPin(locationId, member.id, pin),
    onSuccess: (list) => {
      setPin('');
      onSaved(list);
    },
  });
  const roles = [...member.orgRoles, ...member.roles].map((r) => t(`admin:staff.roles.${r}`));
  return (
    <li className="grid gap-2 rounded-[12px] bg-mist/60 px-3 py-2.5 sm:grid-cols-[1fr_8rem_auto] sm:items-center">
      <span>
        <span className="font-medium">{member.name}</span>{' '}
        <span className="text-[13px] text-soft">
          {roles.join(', ')}
          {member.locked
            ? ` · ${t('platform:locked')}`
            : !member.hasPin
              ? ` · ${t('platform:noPin')}`
              : ''}
        </span>
      </span>
      <input
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        aria-label={`${t('platform:newPin')} ${member.name}`}
        placeholder={t('platform:newPin')}
        className={input}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
      />
      <button
        type="button"
        className={button}
        disabled={!pinOk(pin) || set.isPending}
        onClick={() => set.mutate()}
      >
        {t('platform:setPin')}
      </button>
      {set.error ? (
        <div className="sm:col-span-3">
          <SaveError error={set.error} />
        </div>
      ) : null}
    </li>
  );
}
