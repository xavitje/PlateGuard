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
  /** Set when a platform admin opened this restaurant as its owner: their email. */
  platformAdmin?: string;
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
 * first name and PIN. The roles of the person found decide where the app opens. The location is
 * always given: a new device first asks which restaurant it is for, so a PIN is only ever
 * compared with the PINs of that one location, never with those of every restaurant.
 */
export const PinLoginZ = z.strictObject({
  locationId: IdZ,
  name: z.string().trim().min(1).max(80),
  pin: z.string().regex(/^\d{4,6}$/),
});
export type PinLogin = z.infer<typeof PinLoginZ>;

/**
 * POST /auth/signup: the free start. A restaurant owner creates the restaurant and signs in
 * as its owner, with first name and PIN like everyone else. The email is the owner's contact.
 */
export const SignupZ = z.strictObject({
  restaurant: z.string().trim().min(2).max(120),
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().max(200).pipe(z.email()),
  pin: z.string().regex(/^\d{4,6}$/),
});
export type Signup = z.infer<typeof SignupZ>;

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

/**
 * POST /platform/login: the people who run PlateGuard itself, apart from every restaurant.
 * Email, password and the 6-digit code from an authenticator app; never first name and PIN.
 */
export const PlatformLoginZ = z.strictObject({
  email: z.string().trim().toLowerCase().max(200).pipe(z.email()),
  password: z.string().min(1).max(200),
  code: z.string().regex(/^\d{6}$/),
});
export type PlatformLogin = z.infer<typeof PlatformLoginZ>;

/**
 * POST /platform/reset-password: a forgotten password, reset with the authenticator code
 * (there is no mail yet). Signs in with the new password, which must be long.
 */
export const PlatformResetZ = z.strictObject({
  email: z.string().trim().toLowerCase().max(200).pipe(z.email()),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(12).max(200),
});
export type PlatformReset = z.infer<typeof PlatformResetZ>;

/** GET /platform/me: the signed-in platform admin. */
export interface PlatformMe {
  email: string;
}

export interface PlatformLoginResponse {
  token: string;
  expiresAt: string;
  me: PlatformMe;
}

/**
 * The plans a restaurant (organization) can be on, as named on the landing page (Free, Kitchen,
 * Complete). For now only a label: nothing is limited by plan yet.
 * shortcut: a fixed list, add a plan here when it exists.
 */
export const PLANS = ['free', 'kitchen', 'full'] as const;
export const PlanZ = z.enum(PLANS);
export type Plan = z.infer<typeof PlanZ>;

/** PUT /platform/restaurants/:id/plan */
export const PlatformPlanZ = z.strictObject({ plan: PlanZ });

/** POST /platform/restaurants: a restaurant made on request, same fields as the free start. */
export const PlatformNewRestaurantZ = SignupZ.extend({ plan: PlanZ.default('free') });
export type PlatformNewRestaurant = z.input<typeof PlatformNewRestaurantZ>;

/** GET /platform/restaurants: one row per restaurant (organization). Names and counts, no guest data. */
export interface PlatformRestaurant {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
  /** Email of the first owner, the restaurant's contact. */
  ownerEmail: string | null;
  locations: { id: string; name: string; slug: string; staff: number }[];
  /** Plates in the last 30 days, all locations together. */
  plates30: number;
  /** The last plate, at any location; null before the first. */
  lastActivity: string | null;
}

/** One week (starting Monday, UTC) of activity across all restaurants. */
export interface PlatformWeek {
  /** The Monday, as YYYY-MM-DD. */
  week: string;
  signups: number;
  plates: number;
  /** Plates whose allergy check was anything but clear. */
  warnings: number;
  overrides: number;
  incidents: number;
}

/** GET /platform/stats: counts across the whole app. Never guest data. */
export interface PlatformStats {
  restaurants: number;
  locations: number;
  byPlan: Record<string, number>;
  /** Restaurants with at least one plate in the last 7 and 30 days. */
  active7: number;
  active30: number;
  /** The last 8 weeks, oldest first; the last one is the current week so far. */
  weeks: PlatformWeek[];
  /** Incidents reported in the last 30 days, per severity. */
  incidents30: { LOW: number; MEDIUM: number; HIGH: number };
}
