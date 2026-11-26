import { Injectable } from '@nestjs/common';
import type { PlatformRestaurant } from '@plateguard/contracts';
import { audit, verifyPin } from '@plateguard/db';
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

  failed(id: string, failedTries: number, lockedUntil: Date | null) {
    return this.prisma.system().platformAdmin.update({
      where: { id },
      data: { failedTries, lockedUntil },
    });
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
    return orgs.map((o) => ({
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
}
