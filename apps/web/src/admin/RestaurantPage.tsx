import type { LocationProfile } from '@plateguard/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../shell/TabsLayout';
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

/** Beheer > Restaurant: the name, address and photo of this location. */
export function RestaurantPage() {
  const { t } = useTranslation();
  const profile = useAdmin('profile').data;
  return (
    <div className="grid max-w-2xl gap-5">
      <PageHeader title={t('admin:nav.restaurant')} description={t('admin:restaurant.intro')} />
      {profile ? (
        <ProfileForm profile={profile} />
      ) : (
        <p className="text-soft">{t('common:loading')}</p>
      )}
    </div>
  );
}

function ProfileForm({ profile }: { profile: LocationProfile }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState(profile);
  const [photoError, setPhotoError] = useState(false);
  const save = useAdminSave((c, l) => c.saveProfile(l, form));
  const set = (patch: Partial<LocationProfile>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <form
      className="grid gap-4 rounded-2xl bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        // The name shows in the app frame and on the login screen, which read it from the session.
        save.mutate([], { onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }) });
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
      <SaveError error={save.error} />
      <div className="flex items-center gap-3">
        <button type="submit" className={primary} disabled={save.isPending || !form.name.trim()}>
          {t('admin:save')}
        </button>
        {save.isSuccess && (
          <span className="text-[14px] text-soft">{t('admin:restaurant.saved')}</span>
        )}
      </div>
    </form>
  );
}
