import { z } from 'zod';

/** A kitchen printer that fetches allergy tickets itself (Star CloudPRNT). */
export interface PrinterSummary {
  id: string;
  name: string;
  /** When the printer last asked for work. Null: it has not connected yet. */
  lastSeenAt: string | null;
  /** It asked for work in the last two minutes. */
  online: boolean;
  /** The printer reported a fault on its last call (paper out, cover open). */
  fault: boolean;
  /** Tickets waiting for the printer. */
  waiting: number;
}

export const PrinterInputZ = z.strictObject({ name: z.string().trim().min(1).max(60) });
export type PrinterInput = z.infer<typeof PrinterInputZ>;

export interface PrintersResponse {
  printers: PrinterSummary[];
}

/**
 * After adding a printer or asking for a new address: the path to enter in the printer as its
 * server URL. Shown once; the server keeps only a hash of the key in it.
 */
export interface PrinterAddress extends PrintersResponse {
  printerId: string;
  path: string;
}
