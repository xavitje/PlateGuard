import type { IncidentDetail } from '@plateguard/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { ALLERGEN_NAMES } from '../allergens';
import { useClient, useLocationId } from '../service/ServiceProvider';
import { useAdminSave } from './hooks';
import { button, Field, input, MasterDetail, primary, SaveError } from './ui';

const when = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Allergy incidents: what staff reported, what was known at that moment, and the manager's
 * follow-up. The report can be downloaded as a PDF for the file or the inspector.
 */
export function IncidentsPage() {
  const { t, i18n } = useTranslation();
  const client = useClient();
  const loc = useLocationId();
  const [params, setParams] = useSearchParams();
  const selected = params.get('id');
  const list = useQuery({
    queryKey: ['admin', 'incidents', loc],
    queryFn: () => client.admin.incidents(loc!),
    enabled: !!loc,
  });
  const rows = list.data?.incidents ?? [];
  return (
    <>
      <h1 className="mb-1 text-3xl font-semibold">{t('admin:incidents.title')}</h1>
      <p className="mb-4 max-w-2xl text-soft">{t('admin:incidents.intro')}</p>
      {list.isSuccess && rows.length === 0 ? (
        <p className="text-soft">{t('admin:incidents.none')}</p>
      ) : (
        <MasterDetail
          items={rows.map((r) => ({
            id: r.id,
            name: `${r.seat ? t('admin:incidents.where', { table: r.table, seat: r.seat }) : t('admin:incidents.whereTable', { table: r.table })}${r.dishName ? ` · ${r.dishName}` : ''}`,
            meta: (
              <span className="grid shrink-0 justify-items-end text-[12.5px] font-normal text-soft">
                <span
                  className={
                    r.status === 'OPEN' ? 'font-semibold text-red' : 'font-medium text-soft'
                  }
                >
                  {t(`admin:incidents.status.${r.status}`)}
                </span>
                {when(r.reportedAt, i18n.language)}
              </span>
            ),
          }))}
          selected={selected}
          onSelect={(id) => setParams(id ? { id } : {})}
          detail={
            selected ? (
              <Incident key={selected} id={selected} />
            ) : (
              <p className="text-soft">{t('admin:pick')}</p>
            )
          }
        />
      )}
    </>
  );
}

function Incident({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const client = useClient();
  const loc = useLocationId();
  const q = useQuery({
    queryKey: ['admin', 'incident', loc, id],
    queryFn: () => client.admin.incident(loc!, id),
    enabled: !!loc,
  });
  const [pdfError, setPdfError] = useState(false);
  if (q.isError) return <p className="text-red">{t('common:loadError')}</p>;
  const d = q.data;
  if (!d) return <p className="text-soft">{t('common:loading')}</p>;
  const locale = i18n.language === 'nl' ? 'nl' : 'en';
  const at = (iso: string) => when(iso, i18n.language);
  const s = d.snapshot;

  const pdf = async () => {
    // Opened before the request, so the browser does not block it as a pop-up.
    const tab = window.open('', '_blank');
    setPdfError(false);
    try {
      const blob = await client.admin.incidentPdf(loc!, id, locale);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch {
      tab?.close();
      setPdfError(true);
    }
  };

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {d.seat
              ? t('admin:incidents.where', { table: d.table, seat: d.seat })
              : t('admin:incidents.whereTable', { table: d.table })}
          </h2>
          <p className="text-[13.5px] text-soft">
            {at(d.reportedAt)} · {t('admin:incidents.reportedBy', { name: d.reportedBy })}
          </p>
        </div>
        <button type="button" className={button} onClick={() => void pdf()}>
          {t('admin:incidents.download')}
        </button>
      </header>
      {pdfError && (
        <p role="alert" className="text-[14px] font-medium text-red">
          {t('common:loadError')}
        </p>
      )}

      <Section title={t('admin:incidents.section.report')}>
        <Row label={t('admin:incidents.field.kind')}>{t(`admin:incidents.kind.${d.kind}`)}</Row>
        <Row label={t('admin:incidents.field.severity')}>
          <span className={d.severity === 'HIGH' ? 'font-semibold text-red' : ''}>
            {t(`admin:incidents.severity.${d.severity}`)}
          </span>
        </Row>
        <Row label={t('admin:incidents.field.status')}>
          {t(`admin:incidents.status.${d.status}`)}
          {d.closedAt && ` · ${at(d.closedAt)}${d.closedBy ? ` · ${d.closedBy}` : ''}`}
        </Row>
        <p className="text-[15px] whitespace-pre-wrap">{d.description}</p>
      </Section>

      <Section title={t('admin:incidents.section.guest')}>
        {s.allergies.length === 0 ? (
          <p className="text-soft">{t('admin:incidents.noAllergies')}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {s.allergies.map((a) => (
              <li key={a.label} className="rounded-full bg-mist px-2.5 py-1 text-[13.5px]">
                {ALLERGEN_NAMES[a.label]?.[locale] ?? a.label} ·{' '}
                {t(`common:severity.${a.severity}`, { defaultValue: a.severity })}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('admin:incidents.section.plate')}>
        {!s.plate ? (
          <p className="text-soft">{t('admin:incidents.noPlate')}</p>
        ) : (
          <>
            <Row label={t('admin:incidents.field.dish')}>{s.plate.dishName}</Row>
            <Row label={t('admin:incidents.field.orderedAt')}>{at(s.plate.orderedAt)}</Row>
            <Row label={t('admin:incidents.field.outcome')}>
              {t(`common:outcome.${s.plate.outcome}`, { defaultValue: s.plate.outcome })}
            </Row>
            <Row label={t('admin:incidents.field.status')}>
              {t(`admin:incidents.plateStatus.${s.plate.status}`, {
                defaultValue: s.plate.status,
              })}
            </Row>
            {s.plate.modifications.length > 0 && (
              <Row label={t('admin:incidents.field.modifications')}>
                {s.plate.modifications
                  .map((m) =>
                    m.substitute ? `${m.component} → ${m.substitute}` : `− ${m.component}`,
                  )
                  .join(' · ')}
              </Row>
            )}
            {s.plate.rejectReason && (
              <Row label={t('admin:incidents.field.rejectReason')}>{s.plate.rejectReason}</Row>
            )}
          </>
        )}
      </Section>

      {s.plate && (
        <Section title={t('admin:incidents.section.checks')}>
          {s.checks.length === 0 ? (
            <p className="text-soft">{t('admin:incidents.noChecks')}</p>
          ) : (
            s.checks.map((c, i) => (
              <Row key={i} label={t(`admin:incidents.check.${c.kind}`)}>
                {c.by} · {at(c.at)}
              </Row>
            ))
          )}
        </Section>
      )}

      <Section title={t('admin:incidents.section.timeline')}>
        {s.timeline.length === 0 ? (
          <p className="text-soft">{t('admin:incidents.noTimeline')}</p>
        ) : (
          <ol className="grid gap-1.5">
            {s.timeline.map((e, i) => (
              <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-[14px]">
                <span className="text-soft tabular-nums">{at(e.at)}</span>
                <span>
                  {t(`admin:incidents.event.${e.type.replaceAll('.', '_')}`, {
                    defaultValue: e.type,
                  })}
                  {e.by && <span className="text-soft"> · {e.by}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <FollowUp incident={d} />
    </div>
  );
}

function FollowUp({ incident }: { incident: IncidentDetail }) {
  const { t } = useTranslation();
  const [cause, setCause] = useState(incident.cause ?? '');
  const [measure, setMeasure] = useState(incident.measure ?? '');
  const save = useAdminSave((c, loc, close: boolean) =>
    c.followUpIncident(loc, incident.id, { cause, measure, close }),
  );
  const closed = incident.status === 'CLOSED';
  const complete = cause.trim().length > 0 && measure.trim().length > 0;
  return (
    <Section title={t('admin:incidents.followUpTitle')}>
      <p className="text-[13.5px] text-soft">{t('admin:incidents.followUpHow')}</p>
      <Field label={t('admin:incidents.field.cause')}>
        <textarea
          rows={3}
          maxLength={2000}
          value={cause}
          disabled={closed}
          onChange={(e) => setCause(e.target.value)}
          className={`${input} py-2`}
        />
      </Field>
      <Field label={t('admin:incidents.field.measure')}>
        <textarea
          rows={3}
          maxLength={2000}
          value={measure}
          disabled={closed}
          onChange={(e) => setMeasure(e.target.value)}
          className={`${input} py-2`}
        />
      </Field>
      <SaveError error={save.error} />
      {save.isSuccess && !save.isPending && (
        <p role="status" className="text-[14px] font-medium">
          {t('admin:incidents.saved')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {closed ? (
          <button
            type="button"
            className={button}
            disabled={save.isPending}
            onClick={() => save.mutate([false])}
          >
            {t('admin:incidents.reopen')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={button}
              disabled={save.isPending}
              onClick={() => save.mutate([false])}
            >
              {t('admin:incidents.save')}
            </button>
            <button
              type="button"
              className={primary}
              disabled={save.isPending || !complete}
              onClick={() => save.mutate([true])}
            >
              {t('admin:incidents.saveClose')}
            </button>
          </>
        )}
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[13px] font-semibold tracking-normal text-soft uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(110px,160px)_minmax(0,1fr)] gap-x-3 text-[14.5px]">
      <span className="text-soft">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
