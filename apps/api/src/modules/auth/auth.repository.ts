import { Injectable } from '@nestjs/common';
import type { Principal, Role } from '@plateguard/domain';
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
}
