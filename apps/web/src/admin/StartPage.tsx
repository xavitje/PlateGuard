import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMe } from '../service/ServiceProvider';
import { PageHeader } from '../shell/TabsLayout';
import { useAdmin, useAllergenCard } from './hooks';
import { MenuImport } from './MenuImport';
import { button, primary } from './ui';

/**
 * Beheer > Aan de slag: the free start, from a photo of the menu to a guest menu and an
 * allergen card. Each step reads its state from what is already there, so it is also a
 * checklist to come back to.
 */
export function StartPage() {
  const { t, i18n } = useTranslation();
  const dishes = useAdmin('dishes').data;
  const draft = useAdmin('menuDraft').data;
  const slug = useMe().data?.locations[0]?.slug;
  const card = useAllergenCard();
  const [copied, setCopied] = useState(false);
  if (!dishes || !draft) return <p className="text-soft">{t('common:loading')}</p>;

  const read = dishes.length > 0;
  const checked = read && draft.warnings.length === 0;
  const published = !!draft.published;
  const live = published && !draft.changed;
  const guestUrl = slug ? `${window.location.origin}/menu/${slug}` : '';
  const copy = () =>
    void navigator.clipboard?.writeText(guestUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });

  return (
    <div className="grid max-w-3xl gap-4">
      <PageHeader title={t('admin:start.title')} description={t('admin:start.intro')} />

      <Step n={1} title={t('admin:start.step1')} done={read}>
        {read ? (
          <p className="text-[14.5px] text-soft">
            {t('admin:start.step1Done', { count: dishes.length })}
          </p>
        ) : (
          <>
            <p className="mb-3 text-[14.5px] text-soft">{t('admin:start.step1Text')}</p>
            <MenuImport />
          </>
        )}
      </Step>

      <Step n={2} title={t('admin:start.step2')} done={checked}>
        <p className="text-[14.5px] text-soft">{t('admin:start.step2Text')}</p>
        {read && !checked && (
          <p className="mt-2 text-[14.5px] font-semibold text-amber">
            {t('admin:start.step2Open', { count: draft.warnings.length })}
          </p>
        )}
        {read && (
          <Link
            to="/admin/recipes"
            className={`${checked ? button : primary} mt-3 inline-flex items-center no-underline`}
          >
            {t('admin:start.step2Go')}
          </Link>
        )}
      </Step>

      <Step n={3} title={t('admin:start.step3')} done={live}>
        <p className="text-[14.5px] text-soft">{t('admin:start.step3Text')}</p>
        {read && !live && (
          <Link
            to="/admin/menus"
            className={`${primary} mt-3 inline-flex items-center no-underline`}
          >
            {t('admin:start.step3Go')}
          </Link>
        )}
      </Step>

      <Step n={4} title={t('admin:start.step4')} done={false}>
        <p className="text-[14.5px] text-soft">{t('admin:start.step4Text')}</p>
        {published && slug && (
          <div className="mt-3 grid gap-3">
            <div className="grid gap-1">
              <span className="text-[13px] font-semibold text-soft">
                {t('admin:start.guestLink')}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <a
                  href={`/menu/${slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-brand-ink"
                >
                  {guestUrl}
                </a>
                <button type="button" className={button} onClick={copy}>
                  {copied ? t('admin:start.copied') : t('admin:start.copy')}
                </button>
              </span>
            </div>
            <span>
              <button
                type="button"
                className={button}
                onClick={() =>
                  void card.open(draft.published!.id, i18n.language === 'nl' ? 'nl' : 'en')
                }
              >
                {t('admin:start.card')}
              </button>
            </span>
            {card.error && (
              <p role="alert" className="text-[13.5px] text-red">
                {t('admin:menu.cardError')}
              </p>
            )}
          </div>
        )}
      </Step>

      <section className="rounded-[18px] border border-dashed border-line p-4 sm:p-5">
        <h2 className="mb-1 text-[16.5px] font-semibold">{t('admin:start.nextTitle')}</h2>
        <p className="text-[14.5px] text-soft">{t('admin:start.nextText')}</p>
      </section>
    </div>
  );
}

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 rounded-[18px] bg-card p-4 shadow-card sm:p-5">
      <span
        className={`grid size-8 place-items-center rounded-full text-[15px] font-semibold ${
          done ? 'bg-brand text-white' : 'bg-brand-soft text-brand-ink'
        }`}
        aria-hidden="true"
      >
        {done ? '✓' : n}
      </span>
      <div className="min-w-0">
        <h2 className="mt-1 mb-1.5 text-[17px] font-semibold">
          {title}
          {done && <span className="sr-only"> · {t('admin:start.done')}</span>}
        </h2>
        {children}
      </div>
    </section>
  );
}
