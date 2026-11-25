import { Injectable } from '@nestjs/common';
import type {
  IncidentDetail,
  IncidentFollowUp,
  IncidentReport,
  IncidentsResponse,
} from '@plateguard/contracts';
import { createI18n, type Locale } from '@plateguard/i18n';
import type { TenantContext } from '../auth/permissions.js';
import { renderIncidentReport, type ReportSection } from './incident-report.pdf.js';
import { IncidentRepository } from './incident.repository.js';

const TIME_ZONE = 'Europe/Amsterdam';

/**
 * Incidents: staff report one from a table or a plate, the facts are frozen with it, and a
 * manager records the cause and the measure, then exports it as a PDF for the file.
 */
@Injectable()
export class IncidentService {
  private readonly translators = new Map<Locale, ReturnType<typeof createI18n>>();

  constructor(private readonly repo: IncidentRepository) {}

  async report(
    ctx: TenantContext,
    locationId: string,
    table: string,
    input: IncidentReport,
    userId: string,
  ): Promise<{ id: string }> {
    return { id: await this.repo.report(ctx, locationId, table, input, userId) };
  }

  async list(ctx: TenantContext, locationId: string): Promise<IncidentsResponse> {
    return { incidents: await this.repo.list(ctx, locationId) };
  }

  get(ctx: TenantContext, locationId: string, id: string): Promise<IncidentDetail> {
    return this.repo.get(ctx, locationId, id);
  }

  async followUp(
    ctx: TenantContext,
    locationId: string,
    id: string,
    input: IncidentFollowUp,
    userId: string,
  ): Promise<IncidentDetail> {
    await this.repo.followUp(ctx, locationId, id, input, userId);
    return this.repo.get(ctx, locationId, id);
  }

  async pdf(ctx: TenantContext, locationId: string, id: string, locale: Locale) {
    const [i, location, names] = await Promise.all([
      this.repo.get(ctx, locationId, id),
      this.repo.locationName(ctx, locationId),
      this.repo.allergenNames(ctx, locale),
    ]);
    let tr = this.translators.get(locale);
    if (!tr) this.translators.set(locale, (tr = createI18n(locale)));
    const { t: tf } = await tr;
    const t = (k: string, v: Record<string, unknown> = {}) => tf(`admin:incidents.${k}`, v);
    const time = (iso: string | null) =>
      iso
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'medium',
            timeZone: TIME_ZONE,
          }).format(new Date(iso))
        : '—';
    const s = i.snapshot;
    const plate = s.plate;
    const sections: ReportSection[] = [
      {
        title: t('section.report'),
        rows: [
          { label: t('field.reportedAt'), text: time(i.reportedAt) },
          { label: t('field.reportedBy'), text: i.reportedBy },
          {
            label: t('field.where'),
            text: i.seat
              ? t('where', { table: i.table, seat: i.seat })
              : t('whereTable', { table: i.table }),
          },
          { label: t('field.kind'), text: t(`kind.${i.kind}`) },
          { label: t('field.severity'), text: t(`severity.${i.severity}`) },
          { label: t('field.description'), text: i.description },
        ],
      },
      {
        title: t('section.guest'),
        rows:
          s.allergies.length === 0
            ? [{ text: t('noAllergies') }]
            : s.allergies.map((a) => ({
                text: `${names.get(a.label) ?? a.label} · ${tf(`common:severity.${a.severity}`, { defaultValue: a.severity })}`,
              })),
      },
      {
        title: t('section.plate'),
        rows: plate
          ? [
              { label: t('field.dish'), text: plate.dishName },
              { label: t('field.orderedAt'), text: time(plate.orderedAt) },
              { label: t('field.course'), text: String(plate.course) },
              {
                label: t('field.outcome'),
                text: tf(`common:outcome.${plate.outcome}`, { defaultValue: plate.outcome }),
              },
              {
                label: t('field.status'),
                text: t(`plateStatus.${plate.status}`, { defaultValue: plate.status }),
              },
              {
                label: t('field.modifications'),
                text:
                  plate.modifications
                    .map((m) =>
                      m.substitute
                        ? `${m.component} -> ${m.substitute}`
                        : `${m.action} ${m.component}`,
                    )
                    .join('\n') || '—',
              },
              ...(plate.rejectReason
                ? [{ label: t('field.rejectReason'), text: plate.rejectReason }]
                : []),
              {
                label: t('field.engine'),
                text: [plate.engineVersion, plate.menuVersionId].filter(Boolean).join(' · ') || '—',
              },
            ]
          : [{ text: t('noPlate') }],
      },
      {
        title: t('section.checks'),
        rows:
          s.checks.length === 0
            ? [{ text: t('noChecks') }]
            : s.checks.map((c) => ({
                label: time(c.at),
                text: `${t(`check.${c.kind}`, { defaultValue: c.kind })} · ${c.by}`,
              })),
      },
      {
        title: t('section.timeline'),
        rows:
          s.timeline.length === 0
            ? [{ text: t('noTimeline') }]
            : s.timeline.map((e) => ({
                label: time(e.at),
                text: `${t(`event.${e.type.replace(/\./g, '_')}`, { defaultValue: e.type })}${e.by ? ` · ${e.by}` : ''}`,
              })),
      },
      {
        title: t('section.followUp'),
        rows: [
          { label: t('field.status'), text: t(`status.${i.status}`) },
          { label: t('field.cause'), text: i.cause ?? '' },
          { label: t('field.measure'), text: i.measure ?? '' },
          ...(i.closedAt
            ? [{ label: t('field.closed'), text: `${time(i.closedAt)} · ${i.closedBy ?? ''}` }]
            : []),
        ],
      },
    ];
    return renderIncidentReport({
      title: t('pdf.title'),
      subtitle: t('pdf.subtitle', { location, time: time(i.reportedAt) }),
      sections,
      footer: t('pdf.footer', { id: i.id, time: time(new Date().toISOString()) }),
      page: (n, of) => t('pdf.page', { n, of }),
    });
  }
}
