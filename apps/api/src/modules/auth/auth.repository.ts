import { Injectable } from '@nestjs/common';
import type { Principal, Role } from '@plateguard/domain';
import { hashPin, verifyPin } from '@plateguard/db';
import { PrismaService } from '../../common/prisma.service.js';

export interface LocationRow {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
}

/**
 * Identity lookups happen before a tenant is known, so they use the system client. They read
 * only the user's own role assignments and the locations those grant.
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPrincipal(
    userId: string,
  ): Promise<(Principal & { name: string; locale: string }) | null> {
    const user = await this.prisma.system().user.findUnique({
      where: { id: userId },
      include: { roles: true },
    });
    if (!user) return null;
    return {
      userId: user.id,
      name: user.name,
      locale: user.locale,
      grants: user.roles.map((r) => ({
        organizationId: r.organizationId,
        locationId: r.locationId,
        role: r.role as Role,
      })),
    };
  }

  /**
   * For a token of a platform admin acting as owner: the admin's email and the restaurant, as
   * long as the admin still exists and still acts as this user.
   */
  async openedByPlatform(
    adminId: string,
    userId: string,
    locationId: string,
  ): Promise<{ email: string; organizationId: string } | null> {
    const [admin, location] = await Promise.all([
      this.prisma.system().platformAdmin.findFirst({
        where: { id: adminId, userId },
        select: { email: true },
      }),
      this.findLocation(locationId),
    ]);
    return admin && location
      ? { email: admin.email, organizationId: location.organizationId }
      : null;
  }

  findLocation(id: string): Promise<LocationRow | null> {
    return this.prisma.system().location.findUnique({
      where: { id },
      select: { id: true, organizationId: true, name: true, slug: true },
    });
  }

  locationsOf(organizationIds: string[]): Promise<LocationRow[]> {
    return this.prisma.system().location.findMany({
      where: { organizationId: { in: organizationIds } },
      select: { id: true, organizationId: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
  }

  findLocationBySlug(slug: string): Promise<LocationRow | null> {
    return this.prisma.system().location.findUnique({
      where: { slug },
      select: { id: true, organizationId: true, name: true, slug: true },
    });
  }

  hasPins(locationId: string): Promise<boolean> {
    return this.prisma
      .system()
      .staffPin.count({ where: { locationId } })
      .then((n) => n > 0);
  }

  /** Everyone with a PIN on this one location, with their name to match the typed first name. */
  pins(locationId: string) {
    return this.prisma.system().staffPin.findMany({
      where: { locationId },
      select: {
        userId: true,
        locationId: true,
        pinHash: true,
        failedTries: true,
        user: { select: { name: true } },
      },
    });
  }

  pinMatches(pin: string, pinHash: string): Promise<boolean> {
    return verifyPin(pin, pinHash);
  }

  setFailedTries(userId: string, locationId: string, failedTries: number) {
    return this.prisma.system().staffPin.update({
      where: { userId_locationId: { userId, locationId } },
      data: { failedTries },
    });
  }

  emailTaken(email: string): Promise<boolean> {
    return this.prisma
      .system()
      .user.count({ where: { email } })
      .then((n) => n > 0);
  }

  /** The guest menu address for a new restaurant: a taken one gets a short number behind it. */
  async freeSlug(base: string): Promise<string> {
    let slug = base;
    for (let n = 2; await this.slugTaken(slug); n++) slug = `${base}-${n}`;
    return slug;
  }

  slugTaken(slug: string): Promise<boolean> {
    return this.prisma
      .system()
      .location.count({ where: { slug } })
      .then((n) => n > 0);
  }

  /**
   * A new organization (the free plan, unless the platform admin picks another) with one
   * location, and its owner with a PIN there. One transaction, so a failed step leaves nothing half made.
   */
  async createRestaurant(input: {
    restaurant: string;
    slug: string;
    name: string;
    email: string;
    pin: string;
    plan?: string;
  }): Promise<{ userId: string; locationId: string; organizationId: string }> {
    const pinHash = await hashPin(input.pin);
    return this.prisma.system().$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: input.restaurant, plan: input.plan ?? 'free' },
      });
      const location = await tx.location.create({
        data: {
          organizationId: org.id,
          name: input.restaurant,
          slug: input.slug,
          defaultLocale: 'nl',
          kitchenLocale: 'nl',
        },
      });
      const user = await tx.user.create({
        data: { name: input.name, email: input.email, locale: 'nl' },
      });
      await tx.roleAssignment.create({
        data: { userId: user.id, organizationId: org.id, locationId: null, role: 'OWNER' },
      });
      await tx.staffPin.create({ data: { userId: user.id, locationId: location.id, pinHash } });
      return { userId: user.id, locationId: location.id, organizationId: org.id };
    });
  }
}
