/**
 * One permission check for the API and the UI: can(user, permission, locationId).
 * The API enforces it; the UI only uses it to hide buttons.
 */

export const ROLES = ['OWNER', 'MANAGER', 'CHEF', 'COOK', 'WAITER', 'RUNNER'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'org.billing',
  'org.locations.manage',
  'org.export',
  'staff.manage',
  'staff.manage.owners',
  'floorplan.edit',
  'menu.edit',
  'menu.publish',
  'ingredient.verify',
  'special.create',
  'pos.mapping',
  'integrations.manage',
  'webhooks.manage',
  'dashboard.view',
  'incident.manage',
  'incident.report',
  'override.intolerance',
  'plate.override',
  'kitchen.view',
  'plate.check',
  'plate.reject',
  'plate.remake',
  'table.view',
  'guest.record',
  'guest.severity.adjust',
  'order.create',
  'plate.pass_check',
  'plate.serve',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const COOK: Permission[] = ['kitchen.view', 'plate.check', 'plate.reject', 'plate.remake'];
const CHEF: Permission[] = [
  ...COOK,
  'menu.edit',
  'ingredient.verify',
  'special.create',
  'pos.mapping',
  // Approving a plate the engine blocked, with the guest's consent and a reason.
  'plate.override',
];
const WAITER: Permission[] = [
  'table.view',
  'guest.record',
  'guest.severity.adjust',
  'order.create',
  'incident.report',
  // Waiters carry plates too, so they can mark them served.
  'plate.serve',
];
const RUNNER: Permission[] = ['table.view', 'plate.pass_check', 'plate.serve'];
const MANAGER: Permission[] = [
  ...new Set<Permission>([
    ...CHEF,
    ...WAITER,
    ...RUNNER,
    'staff.manage',
    'floorplan.edit',
    'menu.publish',
    'integrations.manage',
    'webhooks.manage',
    'dashboard.view',
    'incident.manage',
    'override.intolerance',
  ]),
];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  OWNER: PERMISSIONS,
  MANAGER,
  CHEF,
  COOK,
  WAITER,
  RUNNER,
};

/** Owner is always organization wide; everyone else on one location, or the whole organization when locationId is null. */
export interface RoleGrant {
  organizationId: string;
  /** null = every location of the organization, including ones added later. */
  locationId: string | null;
  role: Role;
}

export interface Principal {
  userId: string;
  grants: RoleGrant[];
}

export interface LocationRef {
  id: string;
  organizationId: string;
}

/** Roles add up: a Waiter who is also a Runner has both sets of permissions. */
export function can(user: Principal, permission: Permission, location: LocationRef): boolean {
  return user.grants.some(
    (g) =>
      g.organizationId === location.organizationId &&
      (g.locationId === null || g.locationId === location.id || g.role === 'OWNER') &&
      ROLE_PERMISSIONS[g.role].includes(permission),
  );
}

/** Location ids a user may see in an organization. Used for the row-level security session variable. */
export function allowedLocationIds(
  user: Principal,
  organizationId: string,
  allLocationIds: string[],
): string[] {
  const grants = user.grants.filter((g) => g.organizationId === organizationId);
  if (grants.some((g) => g.locationId === null || g.role === 'OWNER')) return [...allLocationIds];
  return allLocationIds.filter((id) => grants.some((g) => g.locationId === id));
}
