import { Injectable } from '@nestjs/common';
import type { FloorInput, TableInput } from '@plateguard/contracts';
import type { TenantContext } from '../auth/permissions.js';
import { FloorplanRepository } from './floorplan.repository.js';

/** The floor plan editor. Every change returns the whole plan, as the editor shows it. */
@Injectable()
export class FloorplanService {
  constructor(private readonly repo: FloorplanRepository) {}

  floors(ctx: TenantContext, locationId: string) {
    return this.repo.floors(ctx, locationId);
  }

  saveFloor(ctx: TenantContext, locationId: string, id: string | null, input: FloorInput) {
    return this.repo.saveFloor(ctx, locationId, id, input);
  }

  orderFloors(ctx: TenantContext, locationId: string, floorIds: string[]) {
    return this.repo.orderFloors(ctx, locationId, floorIds);
  }

  saveTable(ctx: TenantContext, locationId: string, id: string | null, input: TableInput) {
    return this.repo.saveTable(ctx, locationId, id, input);
  }
}
