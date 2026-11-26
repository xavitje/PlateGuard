import { Injectable } from '@nestjs/common';
import type { PlatformRestaurant, PlatformStats, PlatformWeek } from '@plateguard/contracts';
import { audit, hashPassword, verifyPin } from '@plateguard/db';
import { PrismaService } from '../../common/prisma.service.js';

/**
 * Platform admins live outside every tenant, so their lookups use the system client. Across
 * restaurants this reads names and counts only, never guest data; every change inside a
 * restaurant goes through that restaurant's tenant (row-level security), with an audit event.
 */
@Injectable()
export class PlatformRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.system().platformAdmin.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.system().platformAdmin.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
  }

  /** Same scrypt format as the PINs. */
  passwordMatches(password: string, hash: string): Promise<boolean> {
    return verifyPin(password, hash);
  }

  /**
   * The app_user this admin acts as inside a restaurant, made on first use. It has no roles and
   * no PIN, so it opens nothing by itself: only a platform-opened token grants it a restaurant.
   */
  async actingUser(adminId: string): Promise<string> {
    return this.prisma.system().$transaction(async (tx) => {
      const admin = await tx.platformAdmin.findUniqueOrThrow({
        where: { id: adminId },
        select: { userId: true },
      });
      if (admin.userId) return admin.userId;
      const user = await tx.user.create({ data: { name: 'PlateGuard', locale: 'nl' } });
      await tx.platformAdmin.update({ where: { id: adminId }, data: { userId: user.id } });
      return user.id;
    });
  }

  /**
   * Counts a sign-in try before anything is checked, in one statement, so parallel tries each
   * count. Returns the tries including this one, or null while the account is locked.
   */
  async reserveTry(id: string, max: number, now: Date): Promise<number | null> {
    const rows = await this.prisma.system().$queryRaw<{ failed_tries: number }[]>`
      UPDATE platform_admin SET failed_tries = failed_tries + 1
      WHERE id = ${id}::uuid AND failed_tries < ${max}
        AND (locked_until IS NULL OR locked_until <= ${now})
      RETURNING failed_tries`;
    return rows[0]?.failed_tries ?? null;
  }

  failed(id: string, failedTries: number, lockedUntil: Date | null) {
    return this.prisma.system().platformAdmin.update({
      where: { id },
      data: { failedTries, lockedUntil },
    });
  }

  async setPassword(email: string, password: string) {
    const passwordHash = await hashPassword(password);
    await this.prisma.system().platformAdmin.update({ where: { email }, data: { passwordHash } });
  }

  signedIn(id: string, totpLastStep: number) {
    return this.prisma.system().platformAdmin.update({
      where: { id },
      data: { failedTries: 0, lockedUntil: null, totpLastStep, lastLoginAt: new Date() },
    });
  }

  /** Every restaurant with its locations and how many people work there. Names and counts only. */
  async restaurants(): Promise<PlatformRestaurant[]> {
    const orgs = await this.prisma.system().organization.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        plan: true,
        createdAt: true,
        locations: {
          orderBy: { name: 'asc' },
          select: { id: true, name: true, slug: true, _count: { select: { pins: true } } },
        },
        roles: {
          where: { role: 'OWNER', locationId: null },
          select: { user: { select: { email: true } } },
        },
      },
    });
    const since = new Date(Date.now() - 30 * DAY);
    const activity = await this.prisma.system().$queryRaw<
      { organization_id: string; plates30: bigint; last: Date | null }[]
    >`SELECT l.organization_id,
        count(*) FILTER (WHERE p.created_at >= ${since}) AS plates30,
        max(p.created_at) AS last
      FROM plate_order p JOIN location l ON l.id = p.location_id
      GROUP BY l.organization_id`;
    const byOrg = new Map(activity.map((a) => [a.organization_id, a]));
    return orgs.map((o) => ({
      plates30: Number(byOrg.get(o.id)?.plates30 ?? 0),
      lastActivity: byOrg.get(o.id)?.last?.toISOString() ?? null,
      id: o.id,
      name: o.name,
      plan: o.plan,
      createdAt: o.createdAt.toISOString(),
      ownerEmail: o.roles.map((r) => r.user.email).find((e) => e) ?? null,
      locations: o.locations.map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        staff: l._count.pins,
      })),
    }));
  }

  async setPlan(organizationId: string, plan: string): Promise<boolean> {
    const { count } = await this.prisma
      .system()
      .organization.updateMany({ where: { id: organizationId }, data: { plan } });
    return count > 0;
  }

  /**
   * Records a platform action in the restaurant's own audit trail. The actor is no restaurant
   * user, so the platform admin's email is in the payload.
   */
  audit(
    organizationId: string,
    locationId: string | null,
    admin: string,
    e: { type: string; entity: string; entityId: string; payload?: Record<string, unknown> },
  ) {
    const ctx = { organizationId, locationIds: locationId ? [locationId] : [] };
    return this.prisma.forTenant(ctx, (tx) =>
      audit(tx, ctx, { ...e, locationId, payload: { ...e.payload, platformAdmin: admin } }),
    );
  }

  /** Counts across every restaurant: how many, how active, what happened per week. */
  async stats(now = new Date()): Promise<PlatformStats> {
    const db = this.prisma.system();
    const weeks = lastWeeks(now, 8);
    const from = new Date(`${weeks[0]}T00:00:00Z`);
    const day7 = new Date(now.getTime() - 7 * DAY);
    const day30 = new Date(now.getTime() - 30 * DAY);
    const [orgs, locations, active, weekly, severity] = await Promise.all([
      db.organization.groupBy({ by: ['plan'], _count: { _all: true } }),
      db.location.count(),
      db.$queryRaw<{ active7: bigint; active30: bigint }[]>`SELECT
          count(DISTINCT l.organization_id) FILTER (WHERE p.created_at >= ${day7}) AS active7,
          count(DISTINCT l.organization_id) AS active30
        FROM plate_order p JOIN location l ON l.id = p.location_id
        WHERE p.created_at >= ${day30}`,
      db.$queryRaw<{ kind: keyof Omit<PlatformWeek, 'week'>; week: Date; n: bigint }[]>`
        SELECT 'signups' AS kind, date_trunc('week', created_at) AS week, count(*) AS n
          FROM organization WHERE created_at >= ${from} GROUP BY 2
        UNION ALL SELECT 'plates', date_trunc('week', created_at), count(*)
          FROM plate_order WHERE created_at >= ${from} GROUP BY 2
        UNION ALL SELECT 'warnings', date_trunc('week', created_at), count(*)
          FROM assessment WHERE created_at >= ${from}
          AND outcome NOT IN ('CLEAR', 'CLEAR_WITH_NOTE') GROUP BY 2
        UNION ALL SELECT 'overrides', date_trunc('week', at), count(*)
          FROM override WHERE at >= ${from} GROUP BY 2
        UNION ALL SELECT 'incidents', date_trunc('week', reported_at), count(*)
          FROM incident WHERE reported_at >= ${from} GROUP BY 2`,
      db.incident.groupBy({
        by: ['severity'],
        where: { reportedAt: { gte: day30 } },
        _count: { _all: true },
      }),
    ]);
    const rows = new Map<string, PlatformWeek>(
      weeks.map((week) => [
        week,
        { week, signups: 0, plates: 0, warnings: 0, overrides: 0, incidents: 0 },
      ]),
    );
    for (const r of weekly) {
      const row = rows.get(r.week.toISOString().slice(0, 10));
      if (row) row[r.kind] = Number(r.n);
    }
    const sev = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const s of severity) sev[s.severity] = s._count._all;
    return {
      restaurants: orgs.reduce((n, o) => n + o._count._all, 0),
      locations,
      byPlan: Object.fromEntries(orgs.map((o) => [o.plan, o._count._all])),
      active7: Number(active[0]?.active7 ?? 0),
      active30: Number(active[0]?.active30 ?? 0),
      weeks: [...rows.values()],
      incidents30: sev,
    };
  }
}

const DAY = 24 * 60 * 60 * 1000;

/** The Mondays (UTC, YYYY-MM-DD) of the last n weeks, oldest first, this week last. */
export function lastWeeks(now: Date, n: number): string[] {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return Array.from({ length: n }, (_, i) =>
    new Date(monday.getTime() - (n - 1 - i) * 7 * DAY).toISOString().slice(0, 10),
  );
}
