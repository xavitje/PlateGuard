import type { Permission } from '@plateguard/domain';

/** The admin sections anyone may open; the same list decides whether "Admin" is offered. */
export const ADMIN_PERMISSIONS: Permission[] = [
  'menu.edit',
  'floorplan.edit',
  'integrations.manage',
  'staff.manage',
  'incident.manage',
  'dashboard.view',
];

export type Workspace = 'tables' | 'kitchen' | 'admin';

export const WORKSPACE_PATH: Record<Workspace, string> = {
  tables: '/tables',
  kitchen: '/kitchen',
  admin: '/admin',
};

/** The places this user can work, in the order they are offered. */
export function workspaces(permissions: readonly Permission[]): Workspace[] {
  const has = (p: Permission) => permissions.includes(p);
  return [
    ...(has('table.view') ? (['tables'] as const) : []),
    ...(has('kitchen.view') || has('plate.pass_check') ? (['kitchen'] as const) : []),
    ...(ADMIN_PERMISSIONS.some(has) ? (['admin'] as const) : []),
  ];
}

/**
 * Where someone lands after signing in, from what their roles let them do: a manager or owner
 * in admin, a waiter at the tables, a cook or chef in the kitchen, a runner at the pass (on the
 * kitchen screen). Anyone with more roles can switch from Profile or the tab bar.
 */
export function homeFor(permissions: readonly Permission[]): string {
  const has = (p: Permission) => permissions.includes(p);
  if (has('staff.manage')) return WORKSPACE_PATH.admin;
  if (has('order.create')) return WORKSPACE_PATH.tables;
  if (has('kitchen.view') || has('plate.pass_check')) return WORKSPACE_PATH.kitchen;
  return WORKSPACE_PATH.tables;
}
