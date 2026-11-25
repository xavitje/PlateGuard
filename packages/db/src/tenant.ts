import type { Prisma, PrismaClient } from '@prisma/client';

/** Who is asking, and which rows they may see. Built by the API from the user's role assignments. */
export interface TenantContext {
  organizationId: string;
  /** Every location the user may see in this organization (see allowedLocationIds in @plateguard/domain). */
  locationIds: string[];
  userId?: string;
}

export type TenantTx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, what: string): void {
  if (!UUID.test(value)) throw new Error(`Invalid ${what}: expected a uuid`);
}

/**
 * Runs fn in one transaction as the restricted role plateguard_app, with the tenant set as
 * session variables. Row-level security then refuses every row outside the tenant, even if
 * a query in fn forgets its own filter.
 */
export async function withTenant<T>(
  prisma: PrismaClient,
  ctx: TenantContext,
  fn: (tx: TenantTx) => Promise<T>,
  options?: { timeout?: number },
): Promise<T> {
  assertUuid(ctx.organizationId, 'organizationId');
  ctx.locationIds.forEach((id) => assertUuid(id, 'locationId'));
  if (ctx.userId) assertUuid(ctx.userId, 'userId');

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE plateguard_app');
      await tx.$queryRaw`SELECT
        set_config('app.org_id', ${ctx.organizationId}, true),
        set_config('app.location_ids', ${ctx.locationIds.join(',')}, true),
        set_config('app.user_id', ${ctx.userId ?? ''}, true)`;
      return fn(tx);
    },
    { timeout: options?.timeout ?? 10_000 },
  );
}
