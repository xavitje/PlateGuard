import type { LocationProfile, OrgLocation } from '@plateguard/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../shell/TabsLayout';
import { useLocationId } from '../service/ServiceProvider';
import { useAdmin, useAdminSave } from './hooks';
import { button, Field, input, primary, SaveError } from './ui';

/** Phone photos are too big to keep: made at most 1200 px wide or high, as a JPEG. */
async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

/** Beheer > Restaurant: the name, address and photo of this location, and the other locations. */
export function RestaurantPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const profile = useAdmin('profile').data;
  const save = useAdminSave((c, l, p: LocationProfile) => c.saveProfile(l, p));
  return (
    <div className="grid max-w-2xl gap-5">
      <PageHeader title={t('admin:nav.restaurant')} description={t('admin:restaurant.intro')} />
      {profile ? (
        <ProfileForm
          profile={profile}
          save={save}
          submitLabel={t('admin:save')}
          // The name shows in the app frame and on the login screen, which read it from the session.
          onSaved={() => qc.invalidateQueries({ queryKey: ['me'] })}
        />
      ) : (
        <p className="text-soft">{t('common:loading')}</p>
      )}
      <Locations />
    </div>
  );
}

const EMPTY: LocationProfile = { name: '', address: '', photo: '' };

/** Every location of the restaurant: its sign-in link, a rename, and a new one within the plan. */
function Locations() {
  const { t } = useTranslation();
  const here = useLocationId();
  const data = useAdmin('locations').data;
  const [open, setOpen] = useState<string | null>(null);
  const [copyMenuFrom, setCopyMenuFrom] = useState<string | null>(null);
  const update = useAdminSave((c, l, id: string, p: LocationProfile) => c.saveLocation(l, id, p));
  const create = useAdminSave((c, l, p: LocationProfile) =>
    c.createLocation(l, { ...p, copyMenuFrom }),
  );
  if (!data) return null;
  const full = data.maxLocations !== null && data.locations.length >= data.maxLocations;
  return (
    <section className="grid gap-3" aria-labelledby="locations-title">
      <div>
        <h2 id="locations-title" className="text-[17px] font-semibold">
          {t('admin:restaurant.locations')}
        </h2>
        <p className="text-[14px] text-soft">{t('admin:restaurant.locationsIntro')}</p>
      </div>
      <ul className="grid gap-3">
        {data.locations.map((l) => (
          <li key={l.id} className="grid gap-3 rounded-2xl bg-card p-4">
            <LocationRow
              location={l}
              here={l.id === here}
              open={open === l.id}
              onToggle={() => setOpen(open === l.id ? null : l.id)}
            />
            {open === l.id && l.id !== here && (
              <ProfileForm
                profile={{ name: l.name, address: l.address, photo: l.photo }}
                save={{ ...update, mutate: ([p], o) => update.mutate([l.id, p], o) }}
                submitLabel={t('admin:save')}
              />
            )}
          </li>
        ))}
      </ul>
      {full ? (
        <p className="rounded-2xl bg-card p-4 text-[14px] text-soft">
          {t('admin:restaurant.limit', { count: data.maxLocations ?? 1 })}
        </p>
      ) : open === 'new' ? (
        <div className="grid gap-2">
          <h3 className="font-semibold">{t('admin:restaurant.addTitle')}</h3>
          <ProfileForm
            profile={EMPTY}
            save={create}
            submitLabel={t('admin:restaurant.add')}
            onSaved={() => {
              setOpen(null);
              setCopyMenuFrom(null);
            }}
          >
            <Field label={t('admin:restaurant.copyMenu')} hint={t('admin:restaurant.copyMenuHint')}>
              <select
                className={input}
                value={copyMenuFrom ?? ''}
                onChange={(e) => setCopyMenuFrom(e.target.value || null)}
              >
                <option value="">{t('admin:restaurant.copyMenuNone')}</option>
                {data.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          </ProfileForm>
        </div>
      ) : (
        <div>
          <button type="button" className={button} onClick={() => setOpen('new')}>
            {t('admin:restaurant.add')}
          </button>
        </div>
      )}
    </section>
  );
}

function LocationRow(props: {
  location: OrgLocation;
  here: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const l = props.location;
  const link = `${window.location.origin}/login?location=${l.slug}`;
  return (
    <div className="flex items-start gap-3">
      {l.photo ? (
        <img src={l.photo} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="size-14 shrink-0 rounded-xl bg-line/60" aria-hidden />
      )}
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="font-semibold">
          {l.name}
          {props.here && (
            <span className="ml-2 text-[13px] font-medium text-soft">
              {t('admin:restaurant.here')}
            </span>
          )}
        </p>
        {l.address && <p className="text-[14px] text-soft">{l.address}</p>}
        <p className="text-[13px] text-soft">
          {t('admin:restaurant.signInLink')} <span className="break-all text-ink">{link}</span>
        </p>
      </div>
      {!props.here && (
        <button type="button" className={button} onClick={props.onToggle}>
          {props.open ? t('admin:restaurant.close') : t('admin:restaurant.edit')}
        </button>
      )}
    </div>
  );
}

type Save = {
  mutate: (args: [LocationProfile], options?: { onSuccess?: () => void }) => void;
  isPending: boolean;
  isSuccess: boolean;
  error: unknown;
};

function ProfileForm(props: {
  profile: LocationProfile;
  save: Save;
  submitLabel: string;
  onSaved?: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const { save } = props;
  const [form, setForm] = useState(props.profile);
  const [photoError, setPhotoError] = useState(false);
  const set = (patch: Partial<LocationProfile>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <form
      className="grid gap-4 rounded-2xl bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate([form], { onSuccess: props.onSaved });
      }}
    >
      <Field label={t('admin:restaurant.name')}>
        <input
          className={input}
          value={form.name}
          maxLength={120}
          required
          onChange={(e) => set({ name: e.target.value })}
        />
      </Field>
      <Field label={t('admin:restaurant.address')} hint={t('admin:restaurant.addressHint')}>
        <input
          className={input}
          value={form.address}
          maxLength={200}
          autoComplete="street-address"
          onChange={(e) => set({ address: e.target.value })}
        />
      </Field>
      <div className="grid gap-2 text-[13.5px] font-medium text-soft">
        {t('admin:restaurant.photo')}
        {form.photo && (
          <img
            src={form.photo}
            alt={t('admin:restaurant.photoAlt', { name: form.name })}
            className="aspect-[16/9] w-full rounded-xl object-cover"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <label className={`${button} inline-flex cursor-pointer items-center`}>
            {form.photo ? t('admin:restaurant.photoChange') : t('admin:restaurant.photoAdd')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setPhotoError(false);
                try {
                  set({ photo: await shrink(file) });
                } catch {
                  setPhotoError(true);
                }
              }}
            />
          </label>
          {form.photo && (
            <button type="button" className={button} onClick={() => set({ photo: '' })}>
              {t('admin:restaurant.photoRemove')}
            </button>
          )}
        </div>
        {photoError && (
          <p role="alert" className="text-[14px] font-medium text-red">
            {t('admin:restaurant.photoError')}
          </p>
        )}
      </div>
      {props.children}
      <SaveError error={save.error} />
      <div className="flex items-center gap-3">
        <button type="submit" className={primary} disabled={save.isPending || !form.name.trim()}>
          {props.submitLabel}
        </button>
        {save.isSuccess && (
          <span className="text-[14px] text-soft">{t('admin:restaurant.saved')}</span>
        )}
      </div>
    </form>
  );
}
