import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, withTenant, type TenantContext, type TenantTx } from '@plateguard/db';

/**
 * The only place that holds a database connection. Repositories use forTenant() for every
 * tenant query, so row-level security applies. system() is for the few lookups that happen
 * before a tenant is known (an inbound webhook's connection id, login).
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly client = new PrismaClient();

  forTenant<T>(ctx: TenantContext, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return withTenant(this.client, ctx, fn);
  }

  system(): PrismaClient {
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
