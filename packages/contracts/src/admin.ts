import { z } from 'zod';
import { AllergenCodeZ, IdZ } from './common.js';

const Name = z.string().trim().min(1).max(120);
const OptionalText = z.string().trim().max(120).optional().nullable();
const Codes = z.array(AllergenCodeZ).max(40);

/** An ingredient from a supplier. Changing its allergens without verifying again makes it unverified. */
export const IngredientInputZ = z.strictObject({
  name: Name,
  synonyms: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  contains: Codes.default([]),
  mayContain: Codes.default([]),
  supplier: OptionalText,
  brand: OptionalText,
  articleNumber: OptionalText,
  /** Checked against the label or spec sheet just now. Unverified ingredients make dishes UNKNOWN. */
  verified: z.boolean().default(false),
});
export type IngredientInput = z.infer<typeof IngredientInputZ>;
/** What a client sends: defaults may be left out. */
export type IngredientDraft = z.input<typeof IngredientInputZ>;

export interface IngredientResponse {
  id: string;
  name: string;
  synonyms: string[];
  contains: string[];
  mayContain: string[];
  supplier: string | null;
  brand: string | null;
  articleNumber: string | null;
  verifiedAt: string | null;
  verifiedSource: string | null;
  /** Components that use it. */
  usedIn: number;
}

export const EquipmentInputZ = z.strictObject({ name: Name, allergens: Codes.default([]) });
export type EquipmentInput = z.infer<typeof EquipmentInputZ>;
/** What a client sends: defaults may be left out. */
export type EquipmentDraft = z.input<typeof EquipmentInputZ>;

export interface EquipmentResponse {
  id: string;
  name: string;
  allergens: string[];
}

/** A component (jus, fries, dressing): its ingredients, nested components, substitutes and equipment. */
export const ComponentInputZ = z.strictObject({
  name: Name,
  nameNl: OptionalText,
  omittable: z.boolean().default(false),
  premixed: z.boolean().default(false),
  suitableForSevere: z.boolean().default(false),
  ingredientIds: z.array(IdZ).max(100).default([]),
  equipmentIds: z.array(IdZ).max(20).default([]),
  childIds: z.array(IdZ).max(50).default([]),
  substitutions: z
    .array(z.strictObject({ replacementId: IdZ, suitableForSevere: z.boolean().default(false) }))
    .max(20)
    .default([]),
});
export type ComponentInput = z.infer<typeof ComponentInputZ>;
/** What a client sends: defaults may be left out. */
export type ComponentDraft = z.input<typeof ComponentInputZ>;

export interface ComponentResponse extends Required<Omit<ComponentInput, 'nameNl'>> {
  id: string;
  nameNl: string | null;
}

export const DishInputZ = z.strictObject({
  name: Name,
  nameNl: OptionalText,
  course: z.number().int().min(0).max(9).default(0),
  /** Where waiters find the dish: a category, optionally a subcategory under it. */
  category: OptionalText,
  subcategory: OptionalText,
  priceCents: z.number().int().min(0).max(1_000_000).nullable().default(null),
  /** In plate order. */
  componentIds: z.array(IdZ).min(1).max(30),
});
export type DishInput = z.infer<typeof DishInputZ>;
/** What a client sends: defaults may be left out. */
export type DishDraft = z.input<typeof DishInputZ>;

export interface DishResponse {
  id: string;
  name: string;
  nameNl: string | null;
  course: number;
  category: string | null;
  subcategory: string | null;
  priceCents: number | null;
  componentIds: string[];
}

export const MenuItemsZ = z.strictObject({ dishIds: z.array(IdZ).max(200) });
export type MenuItems = z.infer<typeof MenuItemsZ>;

export interface MenuVersionSummary {
  id: string;
  version: number;
  publishedAt: string;
  dishCount: number;
}

/** A problem that publishing would put in front of guests and waiters. */
export interface PublishWarning {
  code: 'UNVERIFIED_INGREDIENT' | 'EMPTY_COMPONENT';
  dishId: string;
  dishName: string;
  name: string;
}

export interface MenuDraftResponse {
  menuId: string;
  name: string;
  /** The draft, in order. */
  dishIds: string[];
  /** True when the draft or any recipe on it differs from the published version. */
  changed: boolean;
  published: MenuVersionSummary | null;
  versions: MenuVersionSummary[];
  warnings: PublishWarning[];
}

export interface AllergenResponse {
  code: string;
  parent: string | null;
  name: string;
}

// ─── Floor plan ─────────────────────────────────────────────────────────────

export const FloorInputZ = z.strictObject({
  name: Name,
  /** Hidden floors (a closed terrace) disappear from service without losing their tables. */
  hidden: z.boolean().default(false),
});
export type FloorInput = z.infer<typeof FloorInputZ>;
export type FloorDraft = z.input<typeof FloorInputZ>;

export const FloorOrderZ = z.strictObject({ floorIds: z.array(IdZ).max(50) });

/** Smallest and largest table side on the drawing, in percent of its width. */
export const TABLE_SIZE = { min: 4, max: 40 } as const;

/**
 * Tables on the drawing: centres in percent of its width and height, sizes in percent of its
 * width, rotation in degrees clockwise. A size or rotation left out stays as it is; a null size
 * goes back to the size from the seats.
 */
export const FloorLayoutZ = z.strictObject({
  tables: z
    .array(
      z.strictObject({
        id: IdZ,
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        w: z.number().min(TABLE_SIZE.min).max(TABLE_SIZE.max).nullable().optional(),
        h: z.number().min(TABLE_SIZE.min).max(TABLE_SIZE.max).nullable().optional(),
        rotation: z.number().min(0).lt(360).optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type FloorLayout = z.infer<typeof FloorLayoutZ>;

export const TableInputZ = z.strictObject({
  floorId: IdZ,
  /** What waiters call it, and the address in the app. Unique among the location's tables. */
  label: z.string().trim().min(1).max(12),
  seats: z.number().int().min(1).max(40),
  shape: z.enum(['ROUND', 'SQUARE', 'RECT']).default('SQUARE'),
  /** Table number in the POS, when it differs from the label. */
  externalRef: OptionalText,
  /** Removed tables stay in the history of past visits. */
  active: z.boolean().default(true),
});
export type TableInput = z.infer<typeof TableInputZ>;
export type TableDraft = z.input<typeof TableInputZ>;

export interface AdminTable {
  id: string;
  floorId: string | null;
  label: string;
  seats: number;
  shape: 'ROUND' | 'SQUARE' | 'RECT';
  externalRef: string | null;
  active: boolean;
  /** A visit is open: seats cannot drop below the highest seat in use. */
  inUse: boolean;
  /** Where the table stands on the drawing, in percent of its width and height. Null: not drawn yet. */
  position: TablePosition | null;
  /** Set by hand on the drawing, in percent of its width. Null: sized from the seats and shape. */
  size: TableSize | null;
  /** Degrees clockwise. */
  rotation: number;
}

export interface TablePosition {
  x: number;
  y: number;
}

export interface TableSize {
  w: number;
  h: number;
}

export interface AdminFloor {
  id: string;
  name: string;
  hidden: boolean;
  tables: AdminTable[];
}

// ─── Staff ─────────────────────────────────────────────────────────────────

export const RoleZ = z.enum(['OWNER', 'MANAGER', 'CHEF', 'COOK', 'WAITER', 'RUNNER']);
export const PinZ = z.string().regex(/^\d{4,6}$/);

export const StaffInputZ = z.strictObject({
  name: Name,
  /** Roles at this location. Roles that hold for every location are managed by an owner. */
  roles: z.array(RoleZ).min(1).max(6),
  pin: PinZ.optional(),
});
export type StaffInput = z.infer<typeof StaffInputZ>;
export type StaffDraft = z.input<typeof StaffInputZ>;

export const StaffPinZ = z.strictObject({ pin: PinZ });

export interface StaffMember {
  id: string;
  name: string;
  /** Roles at this location. */
  roles: z.infer<typeof RoleZ>[];
  /** Roles that hold for every location of the organization. Read only here. */
  orgRoles: z.infer<typeof RoleZ>[];
  hasPin: boolean;
  /** Five wrong PINs in a row: a manager sets a new PIN to unlock. */
  locked: boolean;
  /** Names of the other locations of the restaurant where this person has a role. */
  elsewhere: string[];
}

/** Someone who works at another location of the restaurant, but not here yet. */
export interface StaffCandidate {
  id: string;
  name: string;
  locations: string[];
}

/** Brings someone from another location here: their roles and PIN for this location. */
export const StaffLinkZ = z.strictObject({
  roles: StaffInputZ.shape.roles,
  pin: PinZ,
});
export type StaffLink = z.infer<typeof StaffLinkZ>;

// ─── Menu import ───────────────────────────────────────────────────────────

/** Photos or a PDF of an existing menu. Vercel takes at most 4.5 MB per request. */
export const MenuImportInputZ = z.strictObject({
  files: z
    .array(
      z.strictObject({
        mediaType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
        /** Base64, no data: prefix. */
        data: z.string().min(1).max(6_000_000),
      }),
    )
    .min(1)
    .max(10),
});
export type MenuImportInput = z.infer<typeof MenuImportInputZ>;

/** What the AI read from the menu. A proposal only: nothing is saved until the owner imports it. */
export interface ImportedDish {
  name: string;
  category: string | null;
  priceCents: number | null;
  description: string | null;
  components: {
    name: string;
    /** Allergens are a guess from the dish name and description: always saved unverified. */
    ingredients: { name: string; contains: string[]; mayContain: string[] }[];
  }[];
}

export interface MenuImportProposal {
  dishes: ImportedDish[];
}

/** The restaurant as guests and staff see it: name, address and one photo. */
export const LocationProfileZ = z.strictObject({
  name: Name,
  address: z.string().trim().max(200),
  /** A JPEG, PNG or WebP data URL, or empty for no photo. Made small in the browser first. */
  photo: z
    .string()
    .max(1_500_000)
    .regex(/^(data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*)?$/),
});
export type LocationProfile = z.infer<typeof LocationProfileZ>;

/** A new location of the same restaurant. copyMenuFrom: a location whose dishes and menu start as the draft here. */
export const NewLocationZ = LocationProfileZ.extend({
  copyMenuFrom: z.uuid().nullable().default(null),
});
export type NewLocation = z.input<typeof NewLocationZ>;

export interface OrgLocation {
  id: string;
  name: string;
  address: string;
  photo: string;
  /** The guest menu address, and the sign-in screen of its devices: /login?location=<slug>. */
  slug: string;
}

export interface OrgLocationsResponse {
  plan: string;
  /** null = no limit on this plan. */
  maxLocations: number | null;
  locations: OrgLocation[];
}
