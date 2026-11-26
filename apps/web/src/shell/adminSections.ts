import type { Permission } from '@plateguard/domain';

/** The admin sections, in the order they are shown in the sidebar and the strip on a phone. */
export const ADMIN_SECTIONS: { slug: string; key: string; permission?: Permission }[] = [
  { slug: 'start', key: 'admin:nav.start', permission: 'menu.edit' },
  { slug: 'recipes', key: 'admin:nav.recipes', permission: 'menu.edit' },
  { slug: 'menus', key: 'admin:nav.menus', permission: 'menu.edit' },
  { slug: 'floor-plan', key: 'admin:nav.floorPlan', permission: 'floorplan.edit' },
  { slug: 'staff', key: 'admin:nav.staff', permission: 'staff.manage' },
  { slug: 'integrations', key: 'admin:nav.integrations', permission: 'integrations.manage' },
  { slug: 'webhooks', key: 'admin:nav.webhooks' },
  { slug: 'incidents', key: 'admin:nav.incidents', permission: 'incident.manage' },
  { slug: 'dashboard', key: 'admin:nav.dashboard', permission: 'dashboard.view' },
];
