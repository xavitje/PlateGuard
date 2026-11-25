import type { PrinterAddress, PrinterSummary } from '@plateguard/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdmin, useAdminSave } from './hooks';
import { button, Field, input, primary, SaveError } from './ui';

/**
 * Connections to the restaurant's own systems. For now the kitchen printer: allergy tickets print
 * on it with every allergy order, for kitchens without a screen. The POS link follows later.
 */
export function IntegrationsPage() {
  const { t } = useTranslation();
  const printers = useAdmin('printers').data?.printers;
  const [name, setName] = useState('');
  const [address, setAddress] = useState<PrinterAddress | null>(null);
  const add = useAdminSave((c, l, body: { name: string }) => c.addPrinter(l, body));
  return (
    <div className="grid max-w-3xl gap-5">
      <div>
        <h1 className="mb-1 text-3xl font-semibold">{t('admin:nav.integrations')}</h1>
        <p className="text-soft">{t('admin:printers.intro')}</p>
      </div>

      <section
        aria-labelledby="printers"
        className="grid gap-4 rounded-[18px] bg-card p-4 shadow-card sm:p-5"
      >
        <div>
          <h2 id="printers" className="text-lg font-semibold">
            {t('admin:printers.title')}
          </h2>
          <p className="text-[14px] text-soft">{t('admin:printers.how')}</p>
        </div>
        {printers === undefined ? (
          <p className="text-soft">{t('common:loading')}</p>
        ) : printers.length === 0 ? (
          <p className="text-[14.5px]">{t('admin:printers.none')}</p>
        ) : (
          <ul className="grid gap-2">
            {printers.map((p) => (
              <PrinterRow key={p.id} printer={p} onAddress={setAddress} />
            ))}
          </ul>
        )}
        {address && <Address address={address} onClose={() => setAddress(null)} />}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate([{ name }], {
              onSuccess: (a) => {
                setAddress(a);
                setName('');
              },
            });
          }}
        >
          <Field label={t('admin:printers.name')}>
            <input
              className={input}
              required
              maxLength={60}
              placeholder={t('admin:printers.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <button className={primary} disabled={add.isPending}>
            {t('admin:printers.add')}
          </button>
        </form>
        <SaveError error={add.error} />
      </section>
    </div>
  );
}

function PrinterRow({
  printer: p,
  onAddress,
}: {
  printer: PrinterSummary;
  onAddress: (a: PrinterAddress) => void;
}) {
  const { t, i18n } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const [tested, setTested] = useState(false);
  const test = useAdminSave((c, l) => c.testPrinter(l, p.id));
  const key = useAdminSave((c, l) => c.newPrinterKey(l, p.id));
  const remove = useAdminSave((c, l) => c.removePrinter(l, p.id));
  const online = p.online;
  const seen = p.lastSeenAt ? new Date(p.lastSeenAt) : null;
  const state = p.fault
    ? t('admin:printers.fault')
    : online
      ? t('admin:printers.online')
      : seen === null
        ? t('admin:printers.never')
        : t('admin:printers.lastSeen', {
            time: new Intl.DateTimeFormat(i18n.language, {
              dateStyle: 'short',
              timeStyle: 'short',
            }).format(seen),
          });
  return (
    <li className="grid gap-2 rounded-[12px] border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{p.name}</p>
          <p className="flex items-center gap-1.5 text-[13.5px] text-soft">
            <i
              aria-hidden
              className={`size-2 rounded-full ${p.fault ? 'bg-red' : online ? 'bg-brand' : 'bg-line'}`}
            />
            {state}
            {p.waiting > 0 && ` · ${t('admin:printers.waiting', { count: p.waiting })}`}
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={button}
            disabled={test.isPending}
            onClick={() => test.mutate([], { onSuccess: () => setTested(true) })}
          >
            {t('admin:printers.test')}
          </button>
          <button
            type="button"
            className={button}
            disabled={key.isPending}
            onClick={() => key.mutate([], { onSuccess: onAddress })}
          >
            {t('admin:printers.newAddress')}
          </button>
          {confirm ? (
            <button
              type="button"
              className={`${button} text-red`}
              onClick={() => remove.mutate([])}
            >
              {t('admin:printers.confirmRemove')}
            </button>
          ) : (
            <button type="button" className={button} onClick={() => setConfirm(true)}>
              {t('admin:remove', { name: p.name })}
            </button>
          )}
        </span>
      </div>
      {tested && (
        <p role="status" className="text-[13.5px] text-soft">
          {t('admin:printers.tested')}
        </p>
      )}
      <SaveError error={test.error ?? key.error ?? remove.error} />
    </li>
  );
}

/** The printer's address, shown once: the server keeps only a hash of its key. */
function Address({ address, onClose }: { address: PrinterAddress; onClose: () => void }) {
  const { t } = useTranslation();
  const url = `${window.location.origin}${address.path}`;
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="grid gap-2 rounded-[12px] bg-brand-soft p-3">
      <p className="font-semibold">{t('admin:printers.addressTitle')}</p>
      <ol className="grid list-decimal gap-1 pl-5 text-[14px]">
        <li>{t('admin:printers.step1')}</li>
        <li>{t('admin:printers.step2')}</li>
        <li>{t('admin:printers.step3')}</li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          aria-label={t('admin:printers.address')}
          className={`${input} font-mono text-[13px]`}
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          className={button}
          onClick={() =>
            void navigator.clipboard?.writeText(url).then(
              () => setCopied(true),
              () => {},
            )
          }
        >
          {copied ? t('admin:printers.copied') : t('admin:printers.copy')}
        </button>
        <button type="button" className={button} onClick={onClose}>
          {t('admin:printers.done')}
        </button>
      </div>
      <p className="text-[13px] text-soft">{t('admin:printers.once')}</p>
    </div>
  );
}
