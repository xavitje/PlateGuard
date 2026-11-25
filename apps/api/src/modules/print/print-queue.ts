import type { TenantTx } from '@plateguard/db';

/**
 * Queues the allergy ticket of a new plate for every active kitchen printer of the location, in
 * the order's own transaction: the order and its ticket exist together, or not at all. Plates for
 * guests without allergies need no ticket.
 */
export async function queueAllergyTicket(
  tx: TenantTx,
  locationId: string,
  guestId: string,
  plateId: string,
): Promise<void> {
  const allergies = await tx.guestAllergy.count({ where: { guestId } });
  if (allergies === 0) return;
  const printers = await tx.integrationConnection.findMany({
    where: { locationId, kind: 'PRINTER', status: 'ACTIVE' },
    select: { id: true },
  });
  if (printers.length === 0) return;
  await tx.printJob.createMany({
    data: printers.map((p) => ({
      locationId,
      connectionId: p.id,
      plateId,
      kind: 'TICKET' as const,
    })),
  });
}
