import type { AllergyResult, ChecklistItem, KitchenBlock, Outcome } from '@plateguard/domain';
import { z } from 'zod';
import type { PlateStatusName } from './service.js';

/** One allergy plate on the kitchen display, judged now with the guest's current allergies. */
export interface KitchenTicketResponse {
  plateId: string;
  table: string;
  seat: number;
  course: number;
  dishName: string;
  orderedAt: string;
  status: PlateStatusName;
  outcome: Outcome;
  /** Set when the plate cannot be confirmed: the cook rejects it back to the waiter. */
  block: KitchenBlock | null;
  allergies: Pick<AllergyResult, 'allergen' | 'ingredient' | 'custom' | 'severity' | 'outcome'>[];
  /** Every point to tick before confirming. Empty when blocked. */
  checklist: ChecklistItem[];
  qrToken: string;
}

export interface KitchenResponse {
  /** Plates still to check, oldest first. */
  queue: KitchenTicketResponse[];
  /** Checked plates waiting at the pass. */
  ready: KitchenTicketResponse[];
  /** When on, a runner checks each allergy plate at the pass before it is served. */
  passCheck: boolean;
}

/** The cook confirms a plate with the checklist ids they ticked. All of them are needed. */
export const PlateCheckZ = z.strictObject({ checked: z.array(z.string().max(300)).max(100) });
export type PlateCheck = z.infer<typeof PlateCheckZ>;

export const PlateRejectZ = z.strictObject({ reason: z.string().trim().min(1).max(300) });
export type PlateReject = z.infer<typeof PlateRejectZ>;

export const LocationSettingsZ = z.strictObject({ passCheck: z.boolean() });
export type LocationSettings = z.infer<typeof LocationSettingsZ>;
