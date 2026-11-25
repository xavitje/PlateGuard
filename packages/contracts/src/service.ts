import type {
  AlertKind,
  Assessment,
  Choice,
  GuestAllergy,
  Outcome,
  Permission,
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

/** A change the waiter picks when ordering: leave a component off, or swap it. */
export const ChoiceZ = z.discriminatedUnion('action', [
  z.strictObject({ componentId: IdZ, action: z.literal('OMIT') }),
  z.strictObject({ componentId: IdZ, action: z.literal('SUBSTITUTE'), substituteId: IdZ }),
]);

/** POST /locations/:locationId/tables/:label/seats/:seat/orders */
export const OrderCreateZ = z.strictObject({
  dishId: IdZ,
  /** One per component at most; the engine judges the plate with them. */
  choices: z
    .array(ChoiceZ)
    .max(20)
    .refine((c) => new Set(c.map((x) => x.componentId)).size === c.length)
    .optional(),
  /** Required when the dish is "do not serve" for this guest: why the waiter orders it anyway. */
  note: z.string().trim().max(300).optional(),
});
export type OrderCreate = z.infer<typeof OrderCreateZ>;

export const SeatParamZ = z.coerce.number().int().min(1).max(99);

// Responses. Plain types: the server builds them, the app reads them.

export interface MeResponse {
  user: { id: string; name: string; locale: string };
  locations: {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    /** What this user may do here. The UI hides what is not allowed; the API enforces it. */
    permissions: Permission[];
  }[];
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
  /** On the drawn floor plan, in percent. Null until the table is placed in admin. */
  position: { x: number; y: number } | null;
  /** Size on the drawing in percent of its width. Null: sized from the seats and shape. */
  size: { w: number; h: number } | null;
  /** Degrees clockwise. */
  rotation: number;
}

export interface FloorResponse {
  id: string;
  name: string;
  tables: TableSummary[];
}

/** A dish as the waiter orders it, with where it sits on the menu. */
export type MenuDish = ResolvedDish & {
  course: number;
  /** Null when the restaurant has not set one; the app then groups by course. */
  category: string | null;
  subcategory: string | null;
};

export interface MenuResponse {
  /** Dish and component names in the requested locale, when translated. */
  dishes: MenuDish[];
  /** Every ingredient the organization uses, for the "Other allergy" search. */
  ingredients: SearchableIngredient[];
}

export interface OrderLineResponse {
  id: string;
  dishId: string;
  /** The engine's decision when the order was placed, as stored for the audit trail. */
  outcome: Outcome;
  /** Where the plate is: ordered, checked by the kitchen, at the pass, served, or sent back. */
  status: PlateStatusName;
  /** Why the kitchen sent it back. Only with status REJECTED. */
  rejectReason?: string;
  /** Why the waiter ordered it although it was "do not serve". */
  note?: string;
  /** Why the kitchen approved it although it was blocked. */
  approved?: string;
  /** What the waiter picked when ordering. */
  choices?: Choice[];
}

export type PlateStatusName =
  'ASSESSED' | 'IN_KITCHEN' | 'CHECKED' | 'PASS_CHECKED' | 'SERVED' | 'REJECTED' | 'CANCELLED';

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
  /** Set when the kitchen sent the plate back: the waiter talks to the guest. */
  rejected?: { reason: string };
  /** The signed-in person opened it. It comes back unread when it gets worse or is sent back. */
  read: boolean;
}

/** POST /locations/:id/alerts/read: mark these alerts read, or every open one without ids. */
export const AlertsReadZ = z.strictObject({ ids: z.array(IdZ).max(500).optional() });
export type AlertsRead = z.infer<typeof AlertsReadZ>;

/**
 * POST /auth/pin: one person signs in on a location's shared device for one shift, with their
 * first name and PIN. The roles of the person found decide where the app opens. Without a
 * location (a new device), the person's PIN finds it; when it fits more than one location the
 * API answers 409 LOCATION_CHOICE with those locations, and the device asks which one.
 */
export const PinLoginZ = z.strictObject({
  locationId: IdZ.optional(),
  name: z.string().trim().min(1).max(80),
  pin: z.string().regex(/^\d{4,6}$/),
});
export type PinLogin = z.infer<typeof PinLoginZ>;

export interface LoginResponse {
  token: string;
  expiresAt: string;
  me: MeResponse;
}

/** GET /auth/locations/:slug: the location a shared device signs in to. No names. */
export interface SignInLocationResponse {
  location: { id: string; name: string };
  /** False until a manager has given someone a PIN here. */
  hasStaff: boolean;
}
