import { Injectable } from '@nestjs/common';
import type { LocationProfile, OrgLocation } from '@plateguard/contracts';
import { audit, type TenantTx as Tx } from '@plateguard/db';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service.js';
import type { TenantContext } from '../auth/permissions.js';

/**
 * The locations of one organization, under row-level security. The caller passes a context with
 * every location of the organization (and the new one, when making it).
 */
@Injectable()
export class LocationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  plan(organizationId: string): Promise<string> {
    return this.prisma
      .system()
      .organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true } })
      .then((o) => o.plan);
  }

  list(ctx: TenantContext): Promise<OrgLocation[]> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const rows = await tx.location.findMany({
        where: { organizationId: ctx.organizationId },
        select: { id: true, name: true, address: true, photo: true, slug: true },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((l) => ({ ...l, address: l.address ?? '', photo: l.photo ?? '' }));
    });
  }

  /**
   * One transaction: the location with the settings of `settingsFrom`, the creator's PIN from
   * there (so they can sign in at once), and optionally a copy of another location's dishes and
   * menu draft. Published versions, the floor plan and POS links are not copied.
   */
  create(
    ctx: TenantContext,
    input: {
      id: string;
      slug: string;
      profile: LocationProfile;
      settingsFrom: string;
      copyMenuFrom: string | null;
      userId: string;
    },
  ): Promise<void> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const {
        id: _id,
        createdAt: _c,
        slug: _s,
        name: _n,
        address: _a,
        photo: _p,
        ...settings
      } = await tx.location.findUniqueOrThrow({ where: { id: input.settingsFrom } });
      await tx.location.create({
        data: {
          ...settings,
          id: input.id,
          slug: input.slug,
          name: input.profile.name,
          address: input.profile.address || null,
          photo: input.profile.photo || null,
        },
        select: { id: true },
      });
      const pin = await tx.staffPin.findUnique({
        where: { userId_locationId: { userId: input.userId, locationId: input.settingsFrom } },
      });
      if (pin)
        await tx.staffPin.create({
          data: { userId: input.userId, locationId: input.id, pinHash: pin.pinHash },
        });
      const copied = input.copyMenuFrom ? await copyMenu(tx, input.copyMenuFrom, input.id) : 0;
      await audit(tx, ctx, {
        locationId: input.id,
        type: 'location.created',
        entity: 'location',
        entityId: input.id,
        payload: { name: input.profile.name, copyMenuFrom: input.copyMenuFrom, dishes: copied },
      });
    });
  }
}

/** Copies dishes (with components and translations) and menus with their items. Returns the dish count. */
async function copyMenu(tx: Tx, from: string, to: string): Promise<number> {
  const [dishes, menus] = await Promise.all([
    tx.dish.findMany({
      where: { locationId: from },
      include: { components: true, translations: true },
    }),
    tx.menu.findMany({ where: { locationId: from }, include: { items: true } }),
  ]);
  const dishId = new Map(dishes.map((d) => [d.id, randomUUID()]));
  const menuId = new Map(menus.map((m) => [m.id, randomUUID()]));
  await tx.dish.createMany({
    data: dishes.map(({ components: _c, translations: _t, ...d }) => ({
      ...d,
      id: dishId.get(d.id)!,
      locationId: to,
    })),
  });
  await tx.dishComponent.createMany({
    data: dishes.flatMap((d) =>
      d.components.map((c) => ({ ...c, dishId: dishId.get(d.id)!, locationId: to })),
    ),
  });
  await tx.dishTranslation.createMany({
    data: dishes.flatMap((d) =>
      d.translations.map((t) => ({ ...t, dishId: dishId.get(d.id)!, locationId: to })),
    ),
  });
  await tx.menu.createMany({
    data: menus.map((m) => ({ id: menuId.get(m.id)!, locationId: to, name: m.name })),
  });
  await tx.menuItem.createMany({
    data: menus.flatMap((m) =>
      m.items.map((i) => ({
        ...i,
        menuId: menuId.get(m.id)!,
        dishId: dishId.get(i.dishId)!,
        locationId: to,
      })),
    ),
  });
  return dishes.length;
}
