import type { PosConnection, PosEvent, PosSyncResult } from '@plateguard/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EU14 } from '@plateguard/domain';
import { ALLERGEN_NAMES } from '../allergens';
import { ApiError } from '../api/client';
import { useClient, useLocationId } from '../service/ServiceProvider';
import { useAdmin, useAdminSave } from './hooks';
import { button, Field, input, primary } from './ui';

const card = 'grid gap-4 rounded-[18px] bg-card p-4 shadow-card sm:p-5';
const step = 'grid gap-3 rounded-[12px] border border-line p-3';

/**
 * The POS link, for now a Square test account: connect it, set up the webhook, link the items
 * to dishes, and ring up a test order to see it arrive as plates on the seats.
 */
export function PosSection() {
  const { t } = useTranslation();
  const status = useAdmin('pos').data;
  return (
    <section aria-labelledby="pos" className={card}>
      <div>
        <h2 id="pos" className="text-lg font-semibold">
          {t('admin:pos.title')}
        </h2>
        <p className="text-[14px] text-soft">{t('admin:pos.how')}</p>
      </div>
      {status === undefined ? (
        <p className="text-soft">{t('common:loading')}</p>
      ) : status.connection ? (
        <Connected connection={status.connection} />
      ) : (
        <Connect secretsReady={status.secretsReady} />
      )}
    </section>
  );
}

/** A failed call as a sentence, with the POS's own reason when there is one. */
function PosError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : 'HTTP_ERROR';
  const reason = error instanceof ApiError ? error.details.reason : undefined;
  const text =
    typeof reason === 'string'
      ? t(`admin:pos.reasons.${reason}`, { defaultValue: t('admin:pos.reasons.OTHER', { reason }) })
      : t(`admin:pos.errors.${code}`, {
          defaultValue: t(`admin:errors.${code}`, { defaultValue: t('common:saveError') }),
        });
  return (
    <p role="alert" className="text-[14px] font-medium text-red">
      {text}
    </p>
  );
}

function Connect({ secretsReady }: { secretsReady: boolean }) {
  const { t } = useTranslation();
  const [accessToken, setToken] = useState('');
  const [squareLocationId, setLocation] = useState('');
  const connect = useAdminSave((c, l, body: { accessToken: string; squareLocationId: string }) =>
    c.connectPos(l, body),
  );
  return (
    <div className="grid gap-3">
      {!secretsReady && (
        <p role="alert" className="rounded-[12px] bg-amber/15 p-3 text-[14px]">
          {t('admin:pos.noSecretKey')}
        </p>
      )}
      <ol className="grid list-decimal gap-1 pl-5 text-[14px]">
        <li>{t('admin:pos.connectStep1')}</li>
        <li>{t('admin:pos.connectStep2')}</li>
      </ol>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          connect.mutate(
            [{ accessToken: accessToken.trim(), squareLocationId: squareLocationId.trim() }],
            {
              onSuccess: () => setToken(''),
            },
          );
        }}
      >
        <Field label={t('admin:pos.accessToken')}>
          <input
            className={input}
            type="password"
            autoComplete="off"
            required
            minLength={20}
            value={accessToken}
            onChange={(e) => setToken(e.target.value)}
          />
        </Field>
        <Field label={t('admin:pos.locationId')}>
          <input
            className={input}
            autoComplete="off"
            required
            minLength={4}
            value={squareLocationId}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <button className={primary} disabled={connect.isPending || !secretsReady}>
            {connect.isPending ? t('admin:pos.connecting') : t('admin:pos.connect')}
          </button>
        </div>
      </form>
      <PosError error={connect.error} />
    </div>
  );
}

function Connected({ connection: c }: { connection: PosConnection }) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const disconnect = useAdminSave((cl, l) => cl.disconnectPos(l));
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line p-3">
        <div>
          <p className="font-medium">
            {c.locationName || c.squareLocationId}
            {c.sandbox && (
              <span className="ml-2 rounded-full bg-amber/15 px-2 py-0.5 text-[12px] font-semibold">
                {t('admin:pos.sandbox')}
              </span>
            )}
          </p>
          <p className="text-[13px] text-soft">
            {t('admin:pos.connectedTo', { id: c.squareLocationId })}
          </p>
        </div>
        {confirm ? (
          <button
            type="button"
            className={`${button} text-red`}
            onClick={() => disconnect.mutate([])}
          >
            {t('admin:pos.confirmDisconnect')}
          </button>
        ) : (
          <button type="button" className={button} onClick={() => setConfirm(true)}>
            {t('admin:pos.disconnect')}
          </button>
        )}
      </div>
      <PosError error={disconnect.error} />
      <p className="text-[14px]">
        {t('admin:pos.webhookElsewhere')}{' '}
        <Link to="/admin/webhooks" className="font-medium text-brand">
          {t('admin:nav.webhooks')}
        </Link>
      </p>
      <Items />
      <AllergyButtons />
      <TestOrder />
    </div>
  );
}

export function Webhook({ connection: c }: { connection: PosConnection }) {
  const { t, i18n } = useTranslation();
  const url = `${window.location.origin}${c.webhookPath}`;
  const [signatureKey, setKey] = useState('');
  const [copied, setCopied] = useState(false);
  const save = useAdminSave((cl, l, body: { url: string; signatureKey: string }) =>
    cl.posWebhook(l, body),
  );
  const ready = c.webhookUrl !== null;
  return (
    <div className={step}>
      <h3 className="font-semibold">{t('admin:pos.webhookTitle')}</h3>
      {ready ? (
        <p className="text-[14px]">
          {c.lastEventAt
            ? t('admin:pos.webhookLast', {
                time: new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: 'short',
                  timeStyle: 'medium',
                }).format(new Date(c.lastEventAt)),
              })
            : t('admin:pos.webhookWaiting')}
        </p>
      ) : (
        <ol className="grid list-decimal gap-1 pl-5 text-[14px]">
          <li>{t('admin:pos.webhookStep1')}</li>
          <li>{t('admin:pos.webhookStep2')}</li>
          <li>{t('admin:pos.webhookStep3')}</li>
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          aria-label={t('admin:pos.webhookUrl')}
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
      </div>
      {ready && c.webhookUrl !== url && (
        <p className="text-[13px] text-soft">
          {t('admin:pos.webhookOther', { url: c.webhookUrl })}
        </p>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate([{ url, signatureKey: signatureKey.trim() }], {
            onSuccess: () => setKey(''),
          });
        }}
      >
        <Field label={t('admin:pos.signatureKey')}>
          <input
            className={input}
            type="password"
            autoComplete="off"
            required
            minLength={8}
            value={signatureKey}
            onChange={(e) => setKey(e.target.value)}
          />
        </Field>
        <button className={ready ? button : primary} disabled={save.isPending}>
          {ready ? t('admin:pos.webhookReplace') : t('admin:pos.webhookSave')}
        </button>
      </form>
      <PosError error={save.error} />
    </div>
  );
}

function usePosRead<T>(
  kind: 'posItems' | 'posEvents' | 'posAllergyButtons',
  fn: (l: string) => Promise<T>,
) {
  const loc = useLocationId();
  return useQuery({
    queryKey: ['admin', kind, loc],
    queryFn: () => fn(loc!),
    enabled: !!loc,
    // New orders arrive by webhook, so the log keeps itself up to date.
    refetchInterval: kind === 'posEvents' ? 15_000 : false,
  });
}

function Items() {
  const { t } = useTranslation();
  const client = useClient();
  const items = usePosRead('posItems', (l) => client.admin.posItems(l));
  const dishes = useAdmin('dishes').data ?? [];
  const push = useAdminSave((c, l) => c.pushPosMenu(l));
  const map = useAdminSave((c, l, externalItemId: string, dishId: string | null) =>
    c.mapPosItem(l, { externalItemId, dishId }),
  );
  const list = items.data?.items;
  return (
    <div className={step}>
      <h3 className="font-semibold">{t('admin:pos.itemsTitle')}</h3>
      <p className="text-[14px] text-soft">{t('admin:pos.itemsHow')}</p>
      <div>
        <button
          type="button"
          className={button}
          disabled={push.isPending}
          onClick={() => push.mutate([])}
        >
          {push.isPending ? t('admin:pos.pushing') : t('admin:pos.push')}
        </button>
      </div>
      <PosError error={push.error ?? map.error ?? items.error} />
      {list === undefined ? (
        items.isLoading && <p className="text-soft">{t('common:loading')}</p>
      ) : list.length === 0 ? (
        <p className="text-[14px]">{t('admin:pos.noItems')}</p>
      ) : (
        <ul className="grid gap-1">
          {list.map((item) => (
            <li
              key={item.externalId}
              className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]"
            >
              <span className="text-[14.5px]">{item.name}</span>
              <select
                aria-label={t('admin:pos.dishFor', { name: item.name })}
                className={input}
                value={item.dishId ?? ''}
                onChange={(e) => map.mutate([item.externalId, e.target.value || null])}
              >
                <option value="">{t('admin:pos.notLinked')}</option>
                {dishes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Summary({ result }: { result: PosSyncResult }) {
  const { t } = useTranslation();
  const parts = [
    t('admin:pos.result.plates', { count: result.plates }),
    ...(['withoutAllergy', 'duplicates', 'unmapped', 'noSeat', 'noTable', 'failed'] as const)
      .filter((k) => result[k] > 0)
      .map((k) => t(`admin:pos.result.${k}`, { count: result[k] })),
  ];
  return <span>{parts.join(' · ')}</span>;
}

function TestOrder() {
  const { t } = useTranslation();
  const client = useClient();
  const floors = useAdmin('floors').data ?? [];
  const tables = floors.flatMap((f) => f.tables.filter((x) => x.active));
  const items = usePosRead('posItems', (l) => client.admin.posItems(l)).data?.items ?? [];
  const dishes = useAdmin('dishes').data ?? [];
  const linked = dishes.filter((d) => items.some((i) => i.dishId === d.id));
  const [table, setTable] = useState('');
  type Line = { seat: number; dishId: string; note: string };
  const [lines, setLines] = useState<Line[]>([{ seat: 1, dishId: '', note: '' }]);
  const [result, setResult] = useState<PosSyncResult | null>(null);
  const place = useAdminSave(
    (c, l, body: { table: string; lines: { seat: number; dishId: string; note?: string }[] }) =>
      c.posTestOrder(l, body),
  );
  const seats = tables.find((x) => x.label === table)?.seats ?? 1;
  const setLine = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className={step}>
      <h3 className="font-semibold">{t('admin:pos.testTitle')}</h3>
      <p className="text-[14px] text-soft">{t('admin:pos.testHow')}</p>
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setResult(null);
          const picked = lines
            .filter((l) => l.dishId)
            .map(({ note, ...l }) => (note.trim() ? { ...l, note: note.trim() } : l));
          place.mutate([{ table, lines: picked }], { onSuccess: setResult });
        }}
      >
        <Field label={t('admin:pos.table')}>
          <select
            className={`${input} w-auto`}
            required
            value={table}
            onChange={(e) => setTable(e.target.value)}
          >
            <option value="" disabled>
              {t('admin:pos.pickTable')}
            </option>
            {tables.map((x) => (
              <option key={x.id} value={x.label}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
        {lines.map((line, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <Field label={t('admin:pos.seat')}>
              <select
                className={`${input} w-auto`}
                value={line.seat}
                onChange={(e) => setLine(i, { seat: Number(e.target.value) })}
              >
                {Array.from({ length: seats }, (_, n) => (
                  <option key={n + 1} value={n + 1}>
                    {n + 1}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('admin:pos.dish')}>
              <select
                className={`${input} w-auto`}
                required
                value={line.dishId}
                onChange={(e) => setLine(i, { dishId: e.target.value })}
              >
                <option value="" disabled>
                  {t('admin:pos.pickDish')}
                </option>
                {linked.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('admin:pos.note')}>
              <input
                className={`${input} w-44`}
                maxLength={120}
                placeholder={t('admin:pos.notePlaceholder')}
                value={line.note}
                onChange={(e) => setLine(i, { note: e.target.value })}
              />
            </Field>
            {lines.length > 1 && (
              <button
                type="button"
                className={button}
                aria-label={t('admin:pos.removeLine')}
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button}
            disabled={lines.length >= 20}
            onClick={() => setLines([...lines, { seat: 1, dishId: '', note: '' }])}
          >
            {t('admin:pos.addLine')}
          </button>
          <button className={primary} disabled={place.isPending || linked.length === 0}>
            {place.isPending ? t('admin:pos.placing') : t('admin:pos.place')}
          </button>
        </div>
      </form>
      {linked.length === 0 && <p className="text-[13px] text-soft">{t('admin:pos.linkFirst')}</p>}
      {result && (
        <p role="status" className="text-[14px] font-medium">
          {t('admin:pos.placed')} <Summary result={result} />
        </p>
      )}
      <PosError error={place.error} />
    </div>
  );
}

export function Events() {
  const { t, i18n } = useTranslation();
  const client = useClient();
  const events = usePosRead('posEvents', (l) => client.admin.posEvents(l));
  const [result, setResult] = useState<PosSyncResult | null>(null);
  const sync = useAdminSave((c, l) => c.syncPos(l));
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'medium' });
  const list = events.data?.events ?? [];
  return (
    <div className={step}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{t('admin:pos.eventsTitle')}</h3>
        <span className="flex gap-2">
          <button type="button" className={button} onClick={() => void events.refetch()}>
            {t('admin:pos.refresh')}
          </button>
          <button
            type="button"
            className={button}
            disabled={sync.isPending}
            onClick={() => sync.mutate([], { onSuccess: setResult })}
          >
            {sync.isPending ? t('admin:pos.syncing') : t('admin:pos.sync')}
          </button>
        </span>
      </div>
      {result && (
        <p role="status" className="text-[14px] font-medium">
          {t('admin:pos.synced', { count: result.orders })} <Summary result={result} />
        </p>
      )}
      <PosError error={sync.error} />
      {list.length === 0 ? (
        <p className="text-[14px] text-soft">{t('admin:pos.noEvents')}</p>
      ) : (
        <ul className="grid gap-2 text-[14px]">
          {list.map((e) => (
            <EventRow key={e.id} event={e} time={time.format(new Date(e.receivedAt))} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** One message from the POS: the order, and per line whether it became a plate and why not. */
function EventRow({ event: e, time }: { event: PosEvent; time: string }) {
  const { t } = useTranslation();
  const name = useAllergenName();
  const o = e.order;
  const problem =
    !!e.rejected ||
    !!o?.skipped ||
    e.status === 'FAILED' ||
    !!o?.lines.some((l) => !['PLACED', 'PLACED_NO_ALLERGY', 'DUPLICATE'].includes(l.outcome));
  return (
    <li className="grid gap-1 rounded-[10px] border border-line px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="tabular-nums text-soft">{time}</span>
        <span className="rounded-full bg-mist px-2 text-[12.5px] font-medium">
          {t(`admin:pos.log.source.${e.source}`)}
        </span>
        {o?.table && (
          <span className="font-medium">{t('admin:pos.log.table', { table: o.table })}</span>
        )}
        <span className="font-mono text-[12.5px] text-soft">{e.orderId?.slice(-8) ?? ''}</span>
        {problem && (
          <span className="rounded-full bg-red/10 px-2 text-[12.5px] font-semibold text-red">
            {t('admin:pos.log.attention')}
          </span>
        )}
      </div>
      {e.rejected ? (
        <p className="text-red">
          {t(`admin:pos.log.rejected.${e.rejected}`, { defaultValue: e.rejected })}
        </p>
      ) : o?.skipped ? (
        <p className="text-red">{t(`admin:pos.log.skip.${o.skipped}`)}</p>
      ) : o ? (
        o.lines.length === 0 ? (
          <p className="text-soft">{t('admin:pos.log.noLines')}</p>
        ) : (
          <ul className="grid gap-0.5">
            {o.lines.map((l, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span>
                  {l.quantity > 1 ? `${l.quantity}× ` : ''}
                  {l.name}
                  {l.seat ? ` · ${t('tables:seat.label', { seat: l.seat })}` : ''}
                </span>
                <span
                  className={
                    ['PLACED', 'PLACED_NO_ALLERGY', 'DUPLICATE'].includes(l.outcome)
                      ? 'text-soft'
                      : 'font-medium text-red'
                  }
                >
                  {t(`admin:pos.log.line.${l.outcome}`)}
                  {l.reason &&
                    `: ${t(`admin:pos.log.reason.${l.reason}`, { defaultValue: l.reason })}`}
                </span>
                {l.fromPos && (
                  <span className="font-medium text-ink">
                    {t('admin:pos.log.fromPos', { list: l.fromPos.map(name).join(', ') })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )
      ) : e.result ? (
        <Summary result={e.result} />
      ) : (
        <p className={e.error ? 'text-red' : 'text-soft'}>
          {e.error ?? t(`admin:pos.state.${e.status}`)}
        </p>
      )}
      {e.status === 'FAILED' && e.error && o && <p className="text-red">{e.error}</p>}
    </li>
  );
}

/** An allergen code by its name in the app's language; anything else as it came. */
function useAllergenName() {
  const { i18n } = useTranslation();
  const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';
  return (code: string) => ALLERGEN_NAMES[code]?.[lang] ?? code;
}

/** The till's buttons, and which allergy each one means. */
function AllergyButtons() {
  const { t } = useTranslation();
  const client = useClient();
  const name = useAllergenName();
  const read = usePosRead('posAllergyButtons', (l) => client.admin.posAllergyButtons(l));
  const set = useAdminSave((c, l, body: { name: string; allergen: string | null }) =>
    c.setPosAllergyButton(l, body),
  );
  const list = read.data?.buttons;
  return (
    <div className={step}>
      <h3 className="font-semibold">{t('admin:pos.buttonsTitle')}</h3>
      <p className="text-[14px] text-soft">{t('admin:pos.buttonsHow')}</p>
      <PosError error={read.error ?? set.error} />
      {list === undefined ? (
        read.isLoading && <p className="text-soft">{t('common:loading')}</p>
      ) : list.length === 0 ? (
        <p className="text-[14px]">{t('admin:pos.buttonsNone')}</p>
      ) : (
        <ul className="grid gap-1">
          {list.map((b) => (
            <li
              key={b.name}
              className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]"
            >
              <span className="text-[14.5px]">{b.name}</span>
              <select
                aria-label={t('admin:pos.buttonFor', { name: b.name })}
                className={input}
                value={b.allergen ?? ''}
                onChange={(e) =>
                  set.mutate([{ name: b.name, allergen: e.target.value || null }], {
                    onSuccess: () => void read.refetch(),
                  })
                }
              >
                <option value="">
                  {b.recognized.length > 0
                    ? t('admin:pos.buttonAuto', { found: b.recognized.map(name).join(', ') })
                    : t('admin:pos.buttonAutoNothing')}
                </option>
                <option value="NONE">{t('admin:pos.buttonNever')}</option>
                {EU14.map((code) => (
                  <option key={code} value={code}>
                    {name(code)}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
