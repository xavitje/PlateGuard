import type { GuestAllergy } from '@plateguard/domain';

export interface OrderLine {
  id: string;
  dishId: string;
}

export interface SeatState {
  allergies: GuestAllergy[];
  /** "No allergy" is an answer too: it is logged as proof the question was asked. */
  noAllergy: boolean;
  orders: OrderLine[];
}

/** Table label → seat number → what is known and ordered at that seat. */
export type ServiceState = Record<string, Record<number, SeatState>>;

export const EMPTY_SEAT: SeatState = { allergies: [], noAllergy: false, orders: [] };
