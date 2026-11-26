import type { MenuDraftResponse } from '@plateguard/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdmin, useAdminSave, useAllergenCard, useCan } from './hooks';
import { button, primary, SaveError, Toggle } from './ui';
import { PageHeader } from '../shell/TabsLayout';

/**
 * Which dishes are on the menu, and publishing. Service works from the published version, so
 * recipe and menu edits reach the floor only when someone publishes.
 */
export function MenuPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const draft = useAdmin('menuDraft').data;
  const dishes = useAdmin('dishes').data ?? [];
  const setItems = useAdminSave(
    (c, l, ids: string[]) => c.setMenuItems(l, ids),
    (qc, loc, [ids]) =>
      qc.setQueryData<MenuDraftResponse>(['admin', 'menuDraft', loc], (d) =>
        d ? { ...d, dishIds: ids } : d,
      ),
  );
  const publish = useAdminSave((c, l) => c.publishMenu(l));
  const { open: openCard, error: cardError } = useAllergenCard();
  const [confirming, setConfirming] = useState(false);
  if (!draft) return <p className="text-soft">{t('common:loading')}</p>;

  const on = draft.dishIds;
  const ordered = [
    ...on.flatMap((id) => dishes.filter((d) => d.id === id)),
    ...dishes.filter((d) => !on.includes(d.id)),
  ];
  const move = (i: number, by: number) => {
    const next = [...on];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    setItems.mutate([next]);
  };
  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );

  return (
    <div className="grid max-w-3xl gap-5">
      <PageHeader title={t('admin:nav.menus')} description={t('admin:menu.intro')} />

      <section className="grid gap-3 rounded-[18px] bg-card p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">
              {draft.published
                ? t('admin:menu.publishedVersion', {
                    version: draft.published.version,
                    date: date(draft.published.publishedAt),
                  })
                : t('admin:menu.neverPublished')}
            </p>
            <p className="text-[14px] text-soft">
              {draft.changed ? t('admin:menu.changed') : t('admin:menu.upToDate')}
            </p>
          </div>
          {can('menu.publish') ? (
            confirming ? (
              <span className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={primary}
                  disabled={publish.isPending}
                  onClick={() => publish.mutate([], { onSettled: () => setConfirming(false) })}
                >
                  {t('admin:menu.confirmPublish')}
                </button>
                <button type="button" className={button} onClick={() => setConfirming(false)}>
                  {t('admin:cancel')}
                </button>
              </span>
            ) : (
              <button
                type="button"
                className={primary}
                disabled={!draft.changed || on.length === 0}
                onClick={() => setConfirming(true)}
              >
                {t('admin:menu.publish')}
              </button>
            )
          ) : (
            <p className="text-[13.5px] text-soft">{t('admin:menu.publishNotAllowed')}</p>
          )}
        </div>
        {confirming && (
          <p className="text-[14px]">{t('admin:menu.publishNote', { count: on.length })}</p>
        )}
        <SaveError error={publish.error} />
        {draft.warnings.length > 0 && (
          <div role="status" className="rounded-[12px] bg-amber/10 p-3">
            <p className="mb-1 text-[14px] font-semibold text-amber">
              {t('admin:menu.warnings', { count: draft.warnings.length })}
            </p>
            <ul className="grid gap-0.5 text-[13.5px]">
              {draft.warnings.map((w) => (
                <li key={`${w.dishId}-${w.code}-${w.name}`}>
                  {t(`admin:menu.warning.${w.code}`, { dish: w.dishName, name: w.name })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-[18px] bg-card p-4 shadow-card sm:p-5">
        <h2 className="mb-3 text-lg font-semibold">{t('admin:menu.dishes')}</h2>
        <ul className="grid gap-1.5">
          {ordered.map((d) => {
            const i = on.indexOf(d.id);
            return (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-[10px] border border-line px-3 py-1"
              >
                <Toggle
                  label={d.name}
                  checked={i >= 0}
                  onChange={(yes) =>
                    setItems.mutate([yes ? [...on, d.id] : on.filter((id) => id !== d.id)])
                  }
                />
                {i >= 0 && (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className={button}
                      disabled={i === 0}
                      aria-label={t('admin:moveUp', { name: d.name })}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={button}
                      disabled={i === on.length - 1}
                      aria-label={t('admin:moveDown', { name: d.name })}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <SaveError error={setItems.error} />
      </section>

      {draft.versions.length > 0 && (
        <section className="rounded-[18px] bg-card p-4 shadow-card sm:p-5">
          <h2 className="mb-2 text-lg font-semibold">{t('admin:menu.history')}</h2>
          <ul className="grid gap-1 text-[14px]">
            {draft.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap justify-between gap-x-3">
                <span>
                  {t('admin:menu.version', { version: v.version })}
                  {v.id === draft.published?.id && ` · ${t('admin:menu.live')}`}
                </span>
                <span className="text-soft">
                  {t('admin:menu.dishCount', { count: v.dishCount })} · {date(v.publishedAt)}
                </span>
                <span className="flex w-full gap-3">
                  {(['nl', 'en'] as const).map((locale) => (
                    <button
                      key={locale}
                      type="button"
                      className="text-brand-ink underline"
                      onClick={() => void openCard(v.id, locale)}
                    >
                      {t('admin:menu.card', { language: locale.toUpperCase() })}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {cardError && (
            <p role="alert" className="mt-2 text-[13.5px] text-red">
              {t('admin:menu.cardError')}
            </p>
          )}
          <p className="mt-2 text-[13px] text-soft">{t('admin:menu.cardHint')}</p>
        </section>
      )}
    </div>
  );
}
