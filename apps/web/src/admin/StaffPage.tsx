import type { StaffMember } from '@plateguard/contracts';
import { ROLES, type Role } from '@plateguard/domain';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMe } from '../service/ServiceProvider';
import { useAdmin, useAdminSave, useCan } from './hooks';
import { button, Field, input, MasterDetail, primary, SaveError, Toggle } from './ui';
import { PageHeader } from '../shell/TabsLayout';

/** Who works here, in which roles, and their PIN for the devices at this location. */
export function StaffPage() {
  const { t } = useTranslation();
  const rows = useAdmin('staff').data ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const slug = useMe().data?.locations[0]?.slug;
  const signInLink = slug ? `${window.location.origin}/login?location=${slug}` : null;
  return (
    <>
      <PageHeader title={t('admin:nav.staff')} description={t('admin:staff.intro')} />
      {signInLink && (
        <p className="mb-4 text-sm text-soft">
          {t('admin:staff.deviceLink')}{' '}
          <span className="font-mono text-ink select-all break-all">{signInLink}</span>
        </p>
      )}
      <MasterDetail
        items={rows.map((m) => ({
          id: m.id,
          name: m.name,
          meta: (
            <span className="text-[12.5px] font-normal text-soft">
              {m.locked
                ? t('admin:staff.locked')
                : [...m.orgRoles, ...m.roles].map((r) => t(`admin:staff.roles.${r}`)).join(', ')}
            </span>
          ),
        }))}
        selected={selected}
        onSelect={setSelected}
        onNew={() => setSelected('new')}
        newLabel={t('admin:staff.new')}
        detail={
          selected ? (
            <StaffForm
              key={selected}
              member={rows.find((m) => m.id === selected)}
              onDone={(id) => setSelected(id)}
            />
          ) : (
            <p className="text-soft">{t('admin:pick')}</p>
          )
        }
      />
    </>
  );
}

function StaffForm({
  member,
  onDone,
}: {
  member?: StaffMember;
  onDone: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const can = useCan();
  const myId = useMe().data?.user.id;
  const self = member?.id === myId;
  const [name, setName] = useState(member?.name ?? '');
  const [roles, setRoles] = useState<Role[]>(member?.roles ?? ['WAITER']);
  const [pin, setPin] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const create = useAdminSave((c, l) => c.createStaff(l, { name, roles, pin: pin || undefined }));
  const update = useAdminSave((c, l, id: string) => c.updateStaff(l, id, { name, roles }));
  const setPinM = useAdminSave((c, l, id: string) => c.setStaffPin(l, id, pin));
  const remove = useAdminSave((c, l, id: string) => c.removeStaff(l, id));
  const grantable = ROLES.filter((r) => r !== 'OWNER' || can('staff.manage.owners'));
  const pinValid = /^\d{4,6}$/.test(pin);
  const error = create.error ?? update.error ?? setPinM.error ?? remove.error;
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!member)
          create.mutate([], {
            onSuccess: (list) => onDone(list.find((m) => m.name === name)?.id ?? null),
          });
        else update.mutate([member.id]);
      }}
    >
      <h2 className="text-xl font-semibold">{member?.name ?? t('admin:staff.new')}</h2>
      {self && <p className="text-[13.5px] text-soft">{t('admin:staff.self')}</p>}
      <Field label={t('admin:fields.name')}>
        <input
          className={input}
          required
          disabled={self}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-[13.5px] font-medium text-soft">
          {t('admin:staff.rolesHere')}
        </legend>
        {grantable.map((r) => (
          <Toggle
            key={r}
            label={t(`admin:staff.roles.${r}`)}
            hint={t(`admin:staff.roleHints.${r}`)}
            disabled={self}
            checked={roles.includes(r)}
            onChange={(on) => setRoles(on ? [...roles, r] : roles.filter((x) => x !== r))}
          />
        ))}
        {member && member.orgRoles.length > 0 && (
          <p className="text-[13.5px] text-soft">
            {t('admin:staff.orgRoles', {
              roles: member.orgRoles.map((r) => t(`admin:staff.roles.${r}`)).join(', '),
            })}
          </p>
        )}
      </fieldset>
      {!member && (
        <Field label={t('admin:staff.pin')} hint={t('admin:staff.pinHint')}>
          <input
            className={input}
            inputMode="numeric"
            autoComplete="off"
            pattern="\d{4,6}"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </Field>
      )}
      <SaveError error={error} />
      {!self && (
        <div>
          <button
            className={primary}
            disabled={
              create.isPending ||
              update.isPending ||
              roles.length === 0 ||
              (!member && !!pin && !pinValid)
            }
          >
            {t('admin:save')}
          </button>
        </div>
      )}
      {member && (
        <section className="grid gap-2 border-t border-line pt-4">
          <h3 className="font-semibold">{t('admin:staff.pin')}</h3>
          <p className="text-[13.5px] text-soft">
            {member.locked
              ? t('admin:staff.lockedHint')
              : member.hasPin
                ? t('admin:staff.hasPin')
                : t('admin:staff.noPin')}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('admin:staff.newPin')}>
              <input
                className={input}
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </Field>
            <button
              type="button"
              className={button}
              disabled={!pinValid || setPinM.isPending}
              onClick={() => setPinM.mutate([member.id], { onSuccess: () => setPin('') })}
            >
              {member.locked ? t('admin:staff.unlock') : t('admin:staff.setPin')}
            </button>
          </div>
        </section>
      )}
      {member && !self && member.orgRoles.length === 0 && (
        <section className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {confirmRemove ? (
            <>
              <span className="text-[14px]">
                {t('admin:staff.removeConfirm', { name: member.name })}
              </span>
              <button
                type="button"
                className={`${button} text-red`}
                onClick={() => remove.mutate([member.id], { onSuccess: () => onDone(null) })}
              >
                {t('admin:staff.removeYes')}
              </button>
              <button type="button" className={button} onClick={() => setConfirmRemove(false)}>
                {t('admin:cancel')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`${button} text-red`}
              onClick={() => setConfirmRemove(true)}
            >
              {t('admin:staff.remove')}
            </button>
          )}
        </section>
      )}
    </form>
  );
}
