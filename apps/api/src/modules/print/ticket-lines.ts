import type { KitchenTicketResponse } from '@plateguard/contracts';
import type { AllergySubject, ChecklistItem } from '@plateguard/domain';
import type { TicketLine } from '../../integrations/core/ticket-document.js';

type T = (key: string, values?: Record<string, unknown>) => string;

/** Restaurants run on local time; the API server may not. */
export const KITCHEN_TIME_ZONE = 'Europe/Amsterdam';

export interface TicketText {
  t: T;
  /** Allergen names in the kitchen language, by code. */
  names: Map<string, string>;
  locale: string;
  reprint: boolean;
}

const subjectName = (s: AllergySubject, names: Map<string, string>) =>
  s.custom ?? s.ingredient?.name ?? names.get(s.allergen ?? '') ?? s.allergen ?? '';

/** The same words as on the kitchen screen. */
export function itemText(item: ChecklistItem, { t, names }: TicketText): string {
  switch (item.kind) {
    case 'ALLERGY':
      return t('kitchen:item.allergy', {
        name: subjectName(item.subject, names),
        severity: t(`common:severity.${item.severity}`),
      });
    case 'OMIT':
      return t('kitchen:item.omit', { name: item.componentName });
    case 'SUBSTITUTE':
      return t('kitchen:item.substitute', { from: item.componentName, to: item.substituteName });
    case 'MANUAL':
      return item.check === 'CUSTOM'
        ? t('kitchen:manualCheck', { label: item.label })
        : t('kitchen:manualCheckTraces', { label: item.label });
    case 'TRACES':
      return t('kitchen:item.traces', { name: subjectName(item.subject, names) });
  }
}

/**
 * The paper allergy ticket: where the plate goes, the dish, and every point to tick, the same
 * list the kitchen screen shows. A plate that must not go out gets that in place of a checklist.
 */
export function ticketLines(ticket: KitchenTicketResponse, text: TicketText): TicketLine[] {
  const { t, locale } = text;
  const time = new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
    timeZone: KITCHEN_TIME_ZONE,
  }).format(new Date(ticket.orderedAt));
  const lines: TicketLine[] = [{ kind: 'title', text: t('kitchen:print.title') }];
  if (text.reprint) lines.push({ kind: 'text', text: t('kitchen:print.reprint'), bold: true });
  lines.push(
    {
      kind: 'text',
      bold: true,
      text: t('kitchen:print.where', {
        table: ticket.table,
        seat: ticket.seat,
        course: ticket.course,
      }),
    },
    { kind: 'text', text: t('kitchen:print.orderedAt', { time }) },
    { kind: 'rule' },
    { kind: 'text', text: ticket.dishName, bold: true },
  );
  if (ticket.waiterNote)
    lines.push({ kind: 'text', text: t('kitchen:waiterNote', { note: ticket.waiterNote }) });
  lines.push({ kind: 'rule' });
  if (ticket.block) {
    lines.push(
      { kind: 'title', text: t('kitchen:print.doNotServe') },
      { kind: 'text', text: t(`kitchen:blocked.${ticket.block}`) },
    );
  } else {
    lines.push({ kind: 'text', text: t('kitchen:tickAll') });
    for (const item of ticket.checklist) lines.push({ kind: 'check', text: itemText(item, text) });
  }
  lines.push(
    { kind: 'rule' },
    { kind: 'text', text: t('kitchen:print.code', { code: shortCode(ticket.qrToken) }) },
  );
  return lines;
}

/** Enough of the plate's token to tell tickets apart at the pass. */
export const shortCode = (token: string) => token.slice(0, 6).toUpperCase();
