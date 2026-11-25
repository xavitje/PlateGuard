import { ForbiddenException, Injectable } from '@nestjs/common';
import type { DashboardFigures, DashboardResponse } from '@plateguard/contracts';
import { can, normalizeLabel, type Principal } from '@plateguard/domain';
import { DashboardRepository, type DashboardPlate } from './dashboard.repository.js';

const DAY = 86_400_000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  return Math.round(m * 10) / 10;
}

/** The spelling used most often; on a tie the first in code point order, so the result does not depend on row order. */
function spelling(spellings: Map<string, number>): string {
  return [...spellings].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]![0];
}

const minutes = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 60_000;

/**
 * The management dashboard: how allergy plates went over a period, per location and for the
 * whole group. Counts only plates for guests with allergies; other plates need nothing extra.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly repo: DashboardRepository) {}

  async get(
    principal: Principal,
    organizationId: string,
    days: number,
    now = new Date(),
  ): Promise<DashboardResponse> {
    const locations = (await this.repo.locations(organizationId)).filter((l) =>
      can(principal, 'dashboard.view', { id: l.id, organizationId }),
    );
    if (locations.length === 0) throw new ForbiddenException({ code: 'FORBIDDEN' });
    const ctx = { organizationId, locationIds: locations.map((l) => l.id) };
    const from = new Date(now.getTime() - days * DAY);
    const [all, incidents] = await Promise.all([
      this.repo.plates(ctx, from),
      this.repo.incidents(ctx, from),
    ]);
    const plates = all.filter((p) => p.guest.length > 0);
    const served = await this.repo.servedAt(
      ctx,
      plates.filter((p) => p.status === 'SERVED').map((p) => p.id),
    );

    const figures = (
      ps: DashboardPlate[],
      inc: { status: string }[],
      passCheck: boolean | null,
    ): DashboardFigures => {
      const outcomes: Record<string, number> = {};
      for (const p of ps) if (p.outcome) outcomes[p.outcome] = (outcomes[p.outcome] ?? 0) + 1;
      const isServed = (p: DashboardPlate) => p.status === 'SERVED';
      return {
        flagged: ps.length,
        outcomes,
        rejected: ps.filter((p) => p.status === 'REJECTED').length,
        served: ps.filter(isServed).length,
        noKitchenCheck: ps.filter(
          (p) => !p.kitchenCheckAt && p.status !== 'REJECTED' && (isServed(p) || p.visitClosed),
        ).length,
        noPassCheck:
          passCheck === null ? null : ps.filter((p) => isServed(p) && !p.passChecked).length,
        unknown: ps.filter((p) => p.outcome === 'UNKNOWN').length,
        customAllergies: ps.filter((p) => p.guest.some((g) => g.custom)).length,
        checkMinutes: median(
          ps.flatMap((p) => (p.kitchenCheckAt ? [minutes(p.createdAt, p.kitchenCheckAt)] : [])),
        ),
        serveMinutes: median(
          ps.flatMap((p) => {
            const at = served.get(p.id);
            return at ? [minutes(p.createdAt, at)] : [];
          }),
        ),
        incidents: inc.length,
        openIncidents: inc.filter((i) => i.status === 'OPEN').length,
      };
    };

    const perLocation = locations.map((l) => ({
      id: l.id,
      name: l.name,
      ...figures(
        plates.filter((p) => p.locationId === l.id),
        incidents.filter((i) => i.locationId === l.id),
        l.passCheck ? true : null,
      ),
    }));
    const anyPass = locations.some((l) => l.passCheck);
    const total = figures(plates, incidents, anyPass ? true : null);
    // Over the whole group, a pass check only counts where it is on.
    if (anyPass) total.noPassCheck = perLocation.reduce((n, l) => n + (l.noPassCheck ?? 0), 0);

    const labels = new Map<string, { count: number; spellings: Map<string, number> }>();
    for (const p of plates)
      for (const g of p.guest)
        if (g.custom) {
          const key = normalizeLabel(g.custom);
          const row = labels.get(key) ?? { count: 0, spellings: new Map<string, number>() };
          row.count++;
          row.spellings.set(g.custom, (row.spellings.get(g.custom) ?? 0) + 1);
          labels.set(key, row);
        }

    return {
      from: from.toISOString(),
      to: now.toISOString(),
      days,
      locations: perLocation,
      total,
      unknownItems: [...labels.values()]
        .map((r) => ({ label: spelling(r.spellings), count: r.count }))
        .sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : 1))
        .slice(0, 10),
    };
  }
}
