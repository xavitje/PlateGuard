import type {
  AlertKind,
  Assessment,
  GuestAllergy,
  Outcome,
  ResolvedDish,
  SearchableIngredient,
} from '@plateguard/domain';
import { z } from 'zod';
import { GuestAllergyZ, IdZ } from './common.js';

/** PUT /locations/:locationId/tables/:label/seats/:seat */
export const SeatUpdateZ = z.strictObject({
  allergies: z.array(GuestAllergyZ).max(40),
  noAllergy: z.boolean().default(false),
});
export type SeatUpdate = z.infer<typeof SeatUpdateZ>;
/** What a client sends: severity and noAllergy may be left out. */
export type SeatUpdateInput = z.input<typeof SeatUpdateZ>;

/** POST /locations/:locationId/tables/:label/seats/:seat/orders */
export const OrderCreateZ = z.strictObject({ dishId: IdZ });
export type OrderCreate = z.infer<typeof OrderCreateZ>;

export const SeatParamZ = z.coerce.number().int().min(1).max(99);

// Responses. Plain types: the server builds them, the app reads them.

export interface MeResponse {
  user: { id: string; name: string; locale: string };
  locations: { id: string; organizationId: string; name: string; slug: string }[];
}

export interface TableSummary {
  id: string;
  label: string;
  seats: number;
  shape: 'ROUND' | 'SQUARE' | 'RECT';
  /** Seats with a guest recorded in the open visit. */
  guests: number;
  allergyGuests: number;
  openAlerts: number;
}

export interface FloorResponse {
  id: string;
  name: string;
  tables: TableSummary[];
}

export interface MenuResponse {
  /** Dish and component names in the requested locale, when translated. */
  dishes: ResolvedDish[];
  /** Every ingredient the organization uses, for the "Other allergy" search. */
  ingredients: SearchableIngredient[];
}

export interface OrderLineResponse {
  id: string;
  dishId: string;
  /** The engine's decision when the order was placed, as stored for the audit trail. */
  outcome: Outcome;
}

export interface SeatResponse {
  seat: number;
  allergies: GuestAllergy[];
  noAllergy: boolean;
  orders: OrderLineResponse[];
}

export interface TableResponse {
  id: string;
  label: string;
  seats: number;
  /** Null until a waiter records something at this table. */
  visitId: string | null;
  bySeat: SeatResponse[];
}

/** An ordered dish that needs attention. Never raised for the menu alone. */
export interface AlertResponse {
  id: string;
  kind: AlertKind;
  table: string;
  seat: number;
  dishId: string;
  dishName: string;
  result: Pick<Assessment, 'outcome' | 'modifications' | 'manualChecks'>;
}
