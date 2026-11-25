import { Injectable, NotFoundException } from '@nestjs/common';
import type { PrinterAddress, PrintersResponse } from '@plateguard/contracts';
import { createI18n, resolveLocale, type Locale } from '@plateguard/i18n';
import { isTicketPrinter, type TicketPrinter } from '../../integrations/core/ports.js';
import { AdapterRegistry } from '../../integrations/core/registry.js';
import type { TicketLine } from '../../integrations/core/ticket-document.js';
import type { TenantContext } from '../auth/permissions.js';
import { KitchenService } from '../kitchen/kitchen.service.js';
import { PROVIDER, PrintRepository, type Job, type Printer } from './print.repository.js';
import { KITCHEN_TIME_ZONE, ticketLines } from './ticket-lines.js';

/** The printer's poll: what CloudPRNT expects back. */
export interface PollReply {
  jobReady: boolean;
  mediaTypes?: string[];
  jobToken?: string;
}

/** A CloudPRNT status such as "200 OK" or "410 Paper Empty", possibly URL-encoded. */
const isOk = (code: unknown) => /^2/.test(decodeURIComponent(String(code ?? '200')).trim());

/**
 * Star CloudPRNT, the server side. The printer polls with POST, fetches a job with GET and
 * reports the result with DELETE, all on its own address. A ticket is drawn when the printer
 * fetches it, in the location's kitchen language, from the same data as the kitchen screen.
 */
@Injectable()
export class PrintService {
  private readonly adapter: TicketPrinter;
  private readonly translators = new Map<Locale, ReturnType<typeof createI18n>>();

  constructor(
    private readonly repo: PrintRepository,
    private readonly kitchen: KitchenService,
    registry: AdapterRegistry,
  ) {
    const adapter = registry.get(PROVIDER);
    if (!isTicketPrinter(adapter)) throw new Error(`No ticket printer adapter ${PROVIDER}`);
    this.adapter = adapter;
  }

  // ─── Staff ───────────────────────────────────────────────────────────────

  async printers(ctx: TenantContext, locationId: string): Promise<PrintersResponse> {
    return { printers: await this.repo.printers(ctx, locationId) };
  }

  async add(ctx: TenantContext, locationId: string, name: string): Promise<PrinterAddress> {
    const { id, key } = await this.repo.add(ctx, locationId, name);
    return this.address(ctx, locationId, id, key);
  }

  async newKey(ctx: TenantContext, locationId: string, printerId: string): Promise<PrinterAddress> {
    const key = await this.repo.newKey(ctx, locationId, printerId);
    return this.address(ctx, locationId, printerId, key);
  }

  async test(ctx: TenantContext, locationId: string, printerId: string): Promise<void> {
    await this.repo.queue(ctx, locationId, { kind: 'TEST', printerId });
  }

  async remove(ctx: TenantContext, locationId: string, printerId: string) {
    await this.repo.remove(ctx, locationId, printerId);
    return this.printers(ctx, locationId);
  }

  async reprint(ctx: TenantContext, locationId: string, plateId: string): Promise<void> {
    await this.repo.queue(ctx, locationId, { kind: 'REPRINT', plateId });
  }

  private async address(
    ctx: TenantContext,
    locationId: string,
    printerId: string,
    key: string,
  ): Promise<PrinterAddress> {
    return {
      printerId,
      path: `/hooks/cloudprnt/${printerId}/${key}`,
      ...(await this.printers(ctx, locationId)),
    };
  }

  // ─── The printer's own calls ─────────────────────────────────────────────

  async poll(id: string, key: string, body: unknown): Promise<PollReply> {
    const printer = await this.printer(id, key);
    await this.repo.seen(printer.id, isOk((body as { statusCode?: unknown } | null)?.statusCode));
    // A job whose plate has closed since is dropped, and the next one is offered.
    for (let i = 0; i < 5; i++) {
      const job = await this.repo.next(printer.id);
      if (!job) break;
      if (await this.lines(printer, job))
        return { jobReady: true, mediaTypes: [...this.adapter.mediaTypes], jobToken: job.id };
      await this.repo.drop(job.id, 'PLATE_CLOSED');
    }
    return { jobReady: false };
  }

  async fetch(id: string, key: string, type: string, token?: string) {
    const printer = await this.printer(id, key);
    const job = token ? await this.repo.job(printer.id, token) : await this.repo.next(printer.id);
    const lines = job && (await this.lines(printer, job));
    if (!job || !lines) throw new NotFoundException();
    await this.repo.sent(job.id);
    return this.adapter.render(lines, type);
  }

  async confirm(id: string, key: string, code: string, token?: string): Promise<void> {
    const printer = await this.printer(id, key);
    const job = token ?? (await this.repo.oldestSent(printer.id));
    if (job) await this.repo.finished(printer, job, isOk(code), code);
  }

  private async printer(id: string, key: string): Promise<Printer> {
    const printer = await this.repo.byAddress(id, key);
    // The same answer for a wrong key as for no printer: the address is the secret.
    if (!printer) throw new NotFoundException();
    return printer;
  }

  private async lines(printer: Printer, job: Job): Promise<TicketLine[] | null> {
    const location = await this.repo.location(printer);
    const locale = resolveLocale(location.kitchenLocale);
    let tr = this.translators.get(locale);
    if (!tr) this.translators.set(locale, (tr = createI18n(locale)));
    const { t } = await tr;
    if (job.kind === 'TEST')
      return [
        { kind: 'title', text: t('kitchen:print.testTitle') },
        { kind: 'text', text: t('kitchen:print.testBody', { location: location.name }) },
        {
          kind: 'text',
          text: new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: KITCHEN_TIME_ZONE,
          }).format(new Date()),
        },
      ];
    if (!job.plateId) return null;
    const ctx = { organizationId: printer.organizationId, locationIds: [printer.locationId] };
    const [ticket, names] = await Promise.all([
      this.kitchen.ticket(ctx, printer.locationId, job.plateId, locale),
      this.repo.allergenNames(printer, locale),
    ]);
    return ticket
      ? ticketLines(ticket, {
          t: (k, v) => t(k, v ?? {}),
          names,
          locale,
          reprint: job.kind === 'REPRINT',
        })
      : null;
  }
}
