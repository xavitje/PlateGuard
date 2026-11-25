import { Injectable } from '@nestjs/common';
import type { Principal, Role } from '@plateguard/domain';
import { verifyPin } from '@plateguard/db';
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

  /** Everyone with a PIN on this location, with their name to match the typed first name. */
  pins(locationId: string) {
    return this.prisma.system().staffPin.findMany({
      where: { locationId },
      select: { userId: true, pinHash: true, failedTries: true, user: { select: { name: true } } },
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
}
