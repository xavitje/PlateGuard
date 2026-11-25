import { ROLE_PERMISSIONS } from '@plateguard/domain';
import { describe, expect, it } from 'vitest';
import { homeFor, workspaces } from './home';

describe('home by role', () => {
  it('sends each role to its own screen', () => {
    expect(homeFor(ROLE_PERMISSIONS.OWNER)).toBe('/admin');
    expect(homeFor(ROLE_PERMISSIONS.MANAGER)).toBe('/admin');
    expect(homeFor(ROLE_PERMISSIONS.WAITER)).toBe('/tables');
    expect(homeFor(ROLE_PERMISSIONS.CHEF)).toBe('/kitchen');
    expect(homeFor(ROLE_PERMISSIONS.COOK)).toBe('/kitchen');
    expect(homeFor(ROLE_PERMISSIONS.RUNNER)).toBe('/kitchen');
  });

  it('offers every place a role can work', () => {
    expect(workspaces(ROLE_PERMISSIONS.MANAGER)).toEqual(['tables', 'kitchen', 'admin']);
    expect(workspaces(ROLE_PERMISSIONS.CHEF)).toEqual(['kitchen', 'admin']);
    expect(workspaces(ROLE_PERMISSIONS.COOK)).toEqual(['kitchen']);
    expect(workspaces(ROLE_PERMISSIONS.RUNNER)).toEqual(['tables', 'kitchen']);
    expect(workspaces(ROLE_PERMISSIONS.WAITER)).toEqual(['tables']);
  });

  it('combines roles: a waiter who also cooks starts at the tables and can open the kitchen', () => {
    const both = [...ROLE_PERMISSIONS.WAITER, ...ROLE_PERMISSIONS.COOK];
    expect(homeFor(both)).toBe('/tables');
    expect(workspaces(both)).toEqual(['tables', 'kitchen']);
  });
});
