import { Injectable, NotFoundException } from '@nestjs/common';
import type { PrinterSummary } from '@plateguard/contracts';
import { audit } from '@plateguard/db';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service.js';
import type { TenantContext } from '../auth/permissions.js';

export const PROVIDER = 'star-cloudprnt';
/** A job fetched but not reported back for this long is offered again. */
const RESEND_AFTER_MS = 60_000;
/** After this many failed attempts a job stops printing and shows as failed. */
const MAX_ATTEMPTS = 3;
/** A printer that has not asked for work for this long is shown as offline. */
const ONLINE_WITHIN_MS = 2 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (key: string) => createHash('sha256').update(key).digest('hex');

/** The printer behind a CloudPRNT address, as the protocol endpoints need it. */
export interface Printer {
  id: string;
  organizationId: string;
  locationId: string;
}

export interface Job {
  id: string;
  kind: 'TICKET' | 'REPRINT' | 'TEST';
  plateId: string | null;
}

/**
 * Kitchen printers and their jobs. The printer's own calls carry only its address, so the tenant
 * is not known yet: those few lookups run outside row-level security, always by connection id
 * after the key in the address matched. Everything staff do goes through forTenant.
 */
@Injectable()
export class PrintRepository {
  constructor(private readonly prisma: PrismaService) {}

  async byAddress(id: string, key: string): Promise<Printer | null> {
    if (!UUID.test(id)) return null;
    const row = await this.prisma.system().integrationConnection.findFirst({
      where: { id, provider: PROVIDER, kind: 'PRINTER', status: 'ACTIVE' },
    });
    const stored = (row?.config as { keyHash?: unknown } | undefined)?.keyHash;
    if (!row || typeof stored !== 'string') return null;
    const a = Buffer.from(stored, 'hex');
    const b = Buffer.from(hash(key), 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { id: row.id, organizationId: row.organizationId, locationId: row.locationId };
  }

  /** Every call of the printer is a sign of life; a status code other than 2xx is a fault. */
  async seen(printerId: string, ok: boolean): Promise<void> {
    await this.prisma.system().integrationConnection.update({
      where: { id: printerId },
      data: { lastHealthAt: new Date(), lastHealthOk: ok },
    });
  }

  /** The oldest job to print: waiting, or fetched a while ago and never reported back. */
  async next(printerId: string): Promise<Job | null> {
    return this.prisma.system().printJob.findFirst({
      where: {
        connectionId: printerId,
        OR: [
          { status: 'PENDING' },
          { status: 'SENT', sentAt: { lt: new Date(Date.now() - RESEND_AFTER_MS) } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, kind: true, plateId: true },
    });
  }

  async job(printerId: string, jobId: string): Promise<Job | null> {
    if (!UUID.test(jobId)) return null;
    return this.prisma.system().printJob.findFirst({
      where: { id: jobId, connectionId: printerId, status: { in: ['PENDING', 'SENT'] } },
      select: { id: true, kind: true, plateId: true },
    });
  }

  /** For printers that do not send the job token back: the job they fetched first. */
  async oldestSent(printerId: string): Promise<string | null> {
    const job = await this.prisma.system().printJob.findFirst({
      where: { connectionId: printerId, status: 'SENT' },
      orderBy: { sentAt: 'asc' },
      select: { id: true },
    });
    return job?.id ?? null;
  }

  async sent(jobId: string): Promise<void> {
    await this.prisma.system().printJob.update({
      where: { id: jobId },
      data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
    });
  }

  /** A job that cannot print at all, such as a plate that is no longer open. */
  async drop(jobId: string, reason: string): Promise<void> {
    await this.prisma.system().printJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', lastError: reason },
    });
  }

  /**
   * The printer's report on a job it fetched. A printed allergy ticket moves its plate to "in the
   * kitchen", so the trail shows the ticket reached the kitchen. A failure is offered again, up
   * to a few times.
   */
  async finished(printer: Printer, jobId: string, ok: boolean, code: string): Promise<void> {
    const job = await this.prisma.system().printJob.findFirst({
      where: { id: jobId, connectionId: printer.id, status: 'SENT' },
    });
    if (!job) return;
    const ctx: TenantContext = {
      organizationId: printer.organizationId,
      locationIds: [printer.locationId],
    };
    await this.prisma.forTenant(ctx, async (tx) => {
      if (!ok) {
        await tx.printJob.update({
          where: { id: job.id },
          data: {
            status: job.attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
            lastError: code.slice(0, 200),
          },
        });
        return;
      }
      await tx.printJob.update({
        where: { id: job.id },
        data: { status: 'PRINTED', printedAt: new Date() },
      });
      if (job.kind === 'TEST' || !job.plateId) return;
      const moved = await tx.plateOrder.updateMany({
        where: { id: job.plateId, locationId: printer.locationId, status: 'ASSESSED' },
        data: { status: 'IN_KITCHEN' },
      });
      await audit(tx, ctx, {
        locationId: printer.locationId,
        type: 'plate.ticket_printed',
        entity: 'plate',
        entityId: job.plateId,
        payload: { printerId: printer.id, jobId: job.id, kind: job.kind, moved: moved.count === 1 },
      });
    });
  }

  /** The location's kitchen language and name, for drawing a ticket. */
  location(printer: Printer) {
    const ctx = { organizationId: printer.organizationId, locationIds: [printer.locationId] };
    return this.prisma.forTenant(ctx, (tx) =>
      tx.location.findUniqueOrThrow({
        where: { id: printer.locationId },
        select: { name: true, kitchenLocale: true },
      }),
    );
  }

  allergenNames(printer: Printer, locale: string): Promise<Map<string, string>> {
    const ctx = { organizationId: printer.organizationId, locationIds: [printer.locationId] };
    return this.prisma.forTenant(ctx, async (tx) => {
      const rows = await tx.allergenTranslation.findMany({
        where: { locale },
        select: { allergenCode: true, name: true },
      });
      return new Map(rows.map((r) => [r.allergenCode, r.name]));
    });
  }

  // ─── Staff ───────────────────────────────────────────────────────────────

  printers(ctx: TenantContext, locationId: string): Promise<PrinterSummary[]> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const rows = await tx.integrationConnection.findMany({
        where: { locationId, kind: 'PRINTER', status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        include: {
          _count: { select: { printJobs: { where: { status: { in: ['PENDING', 'SENT'] } } } } },
        },
      });
      return rows.map((r) => ({
        id: r.id,
        name: r.name ?? '',
        lastSeenAt: r.lastHealthAt?.toISOString() ?? null,
        online: !!r.lastHealthAt && Date.now() - r.lastHealthAt.getTime() < ONLINE_WITHIN_MS,
        fault: r.lastHealthOk === false,
        waiting: r._count.printJobs,
      }));
    });
  }

  count(ctx: TenantContext, locationId: string): Promise<number> {
    return this.prisma.forTenant(ctx, (tx) =>
      tx.integrationConnection.count({ where: { locationId, kind: 'PRINTER', status: 'ACTIVE' } }),
    );
  }

  /** A new printer, with the key for its address. Only the hash of the key is stored. */
  add(ctx: TenantContext, locationId: string, name: string): Promise<{ id: string; key: string }> {
    const key = randomBytes(18).toString('base64url');
    return this.prisma.forTenant(ctx, async (tx) => {
      const row = await tx.integrationConnection.create({
        data: {
          organizationId: ctx.organizationId,
          locationId,
          provider: PROVIDER,
          name,
          kind: 'PRINTER',
          status: 'ACTIVE',
          capabilities: ['print.ticket'],
          config: { keyHash: hash(key) },
        },
      });
      await audit(tx, ctx, {
        locationId,
        type: 'printer.added',
        entity: 'integration_connection',
        entityId: row.id,
        payload: { name },
      });
      return { id: row.id, key };
    });
  }

  /** A new address for a printer; the old one stops working at once. */
  newKey(ctx: TenantContext, locationId: string, id: string): Promise<string> {
    const key = randomBytes(18).toString('base64url');
    return this.prisma.forTenant(ctx, async (tx) => {
      const { count } = await tx.integrationConnection.updateMany({
        where: { id, locationId, kind: 'PRINTER', status: 'ACTIVE' },
        data: { config: { keyHash: hash(key) }, lastHealthAt: null, lastHealthOk: null },
      });
      if (count !== 1) throw new NotFoundException({ code: 'PRINTER_NOT_FOUND' });
      await audit(tx, ctx, {
        locationId,
        type: 'printer.key_renewed',
        entity: 'integration_connection',
        entityId: id,
      });
      return key;
    });
  }

  /** Switches a printer off. Its address stops working and its waiting tickets are dropped. */
  remove(ctx: TenantContext, locationId: string, id: string): Promise<void> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const { count } = await tx.integrationConnection.updateMany({
        where: { id, locationId, kind: 'PRINTER', status: 'ACTIVE' },
        data: { status: 'DISABLED', config: {} },
      });
      if (count !== 1) throw new NotFoundException({ code: 'PRINTER_NOT_FOUND' });
      await tx.printJob.updateMany({
        where: { connectionId: id, status: { in: ['PENDING', 'SENT'] } },
        data: { status: 'FAILED', lastError: 'PRINTER_REMOVED' },
      });
      await audit(tx, ctx, {
        locationId,
        type: 'printer.removed',
        entity: 'integration_connection',
        entityId: id,
      });
    });
  }

  /** A test page on one printer, or a plate's ticket again on every printer. */
  queue(
    ctx: TenantContext,
    locationId: string,
    job: { kind: 'TEST'; printerId: string } | { kind: 'REPRINT'; plateId: string },
  ): Promise<number> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const printers = await tx.integrationConnection.findMany({
        where: {
          locationId,
          kind: 'PRINTER',
          status: 'ACTIVE',
          ...(job.kind === 'TEST' ? { id: job.printerId } : {}),
        },
        select: { id: true },
      });
      if (job.kind === 'TEST' && printers.length === 0)
        throw new NotFoundException({ code: 'PRINTER_NOT_FOUND' });
      if (job.kind === 'REPRINT') {
        const plate = await tx.plateOrder.findFirst({
          where: { id: job.plateId, locationId },
          select: { id: true },
        });
        if (!plate) throw new NotFoundException({ code: 'PLATE_NOT_FOUND' });
      }
      await tx.printJob.createMany({
        data: printers.map((p) => ({
          locationId,
          connectionId: p.id,
          kind: job.kind,
          plateId: job.kind === 'REPRINT' ? job.plateId : null,
        })),
      });
      if (job.kind === 'REPRINT')
        await audit(tx, ctx, {
          locationId,
          type: 'plate.ticket_reprinted',
          entity: 'plate',
          entityId: job.plateId,
        });
      return printers.length;
    });
  }
}
