import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageHeader } from '../shell/TabsLayout';
import { useAdmin } from './hooks';
import { Events, Webhook } from './PosSection';

/** Messages the till sends by itself: the address to give it, and the log of what came in. */
export function WebhooksPage() {
  const { t } = useTranslation();
  const status = useAdmin('pos').data;
  return (
    <div className="grid max-w-3xl gap-5">
      <PageHeader title={t('admin:nav.webhooks')} description={t('admin:webhooks.intro')} />
      {status === undefined ? (
        <p className="text-soft">{t('common:loading')}</p>
      ) : status.connection ? (
        <section className="grid gap-4 rounded-[18px] bg-card p-4 shadow-card sm:p-5">
          <Webhook connection={status.connection} />
          <Events />
        </section>
      ) : (
        <p className="text-[14.5px]">
          {t('admin:webhooks.none')}{' '}
          <Link to="/admin/integrations" className="font-medium text-brand">
            {t('admin:webhooks.toIntegrations')}
          </Link>
        </p>
      )}
    </div>
  );
}
