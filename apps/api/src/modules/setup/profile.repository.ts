import { Injectable } from '@nestjs/common';
import type { LocationProfile } from '@plateguard/contracts';
import { audit } from '@plateguard/db';
import { PrismaService } from '../../common/prisma.service.js';
import type { TenantContext } from '../auth/permissions.js';

/** Name, address and photo of one location, under row-level security. */
@Injectable()
export class ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  get(ctx: TenantContext, locationId: string): Promise<LocationProfile> {
    return this.prisma.forTenant(ctx, async (tx) => {
      const l = await tx.location.findUniqueOrThrow({
        where: { id: locationId },
        select: { name: true, address: true, photo: true },
      });
      return { name: l.name, address: l.address ?? '', photo: l.photo ?? '' };
    });
  }

  save(ctx: TenantContext, locationId: string, p: LocationProfile): Promise<LocationProfile> {
    return this.prisma.forTenant(ctx, async (tx) => {
      await tx.location.update({
        where: { id: locationId },
        data: { name: p.name, address: p.address || null, photo: p.photo || null },
      });
      await audit(tx, ctx, {
        locationId,
        type: 'location.profile_set',
        entity: 'location',
        entityId: locationId,
        // The photo itself is too big for the log.
        payload: { name: p.name, address: p.address, photo: !!p.photo },
      });
      return p;
    });
  }
}
