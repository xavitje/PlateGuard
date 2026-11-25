import { describe, expect, it } from 'vitest';
import { allowedLocationIds, can, type Principal } from '../src/index.js';

const haven = { id: 'loc-haven', organizationId: 'org-a' };
const kade = { id: 'loc-kade', organizationId: 'org-a' };
const other = { id: 'loc-x', organizationId: 'org-b' };

describe('can()', () => {
  it('a waiter on one location can record guests there and nowhere else', () => {
    const u: Principal = {
      userId: 'u1',
      grants: [{ organizationId: 'org-a', locationId: haven.id, role: 'WAITER' }],
    };
    expect(can(u, 'guest.record', haven)).toBe(true);
    expect(can(u, 'guest.record', kade)).toBe(false);
    expect(can(u, 'menu.publish', haven)).toBe(false);
  });

  it('roles add up on the same location', () => {
    const u: Principal = {
      userId: 'u2',
      grants: [
        { organizationId: 'org-a', locationId: haven.id, role: 'WAITER' },
        { organizationId: 'org-a', locationId: haven.id, role: 'RUNNER' },
      ],
    };
    expect(can(u, 'guest.record', haven)).toBe(true);
    expect(can(u, 'plate.pass_check', haven)).toBe(true);
  });

  it('an organization-wide manager covers every location, including later ones, but not other orgs', () => {
    const u: Principal = {
      userId: 'u3',
      grants: [{ organizationId: 'org-a', locationId: null, role: 'MANAGER' }],
    };
    expect(can(u, 'menu.publish', haven)).toBe(true);
    expect(can(u, 'menu.publish', { id: 'loc-new', organizationId: 'org-a' })).toBe(true);
    expect(can(u, 'menu.publish', other)).toBe(false);
    expect(can(u, 'org.billing', haven)).toBe(false);
  });

  it('only managers and owners may override for intolerance', () => {
    const chef: Principal = {
      userId: 'c',
      grants: [{ organizationId: 'org-a', locationId: haven.id, role: 'CHEF' }],
    };
    const owner: Principal = {
      userId: 'o',
      grants: [{ organizationId: 'org-a', locationId: null, role: 'OWNER' }],
    };
    expect(can(chef, 'override.intolerance', haven)).toBe(false);
    expect(can(owner, 'override.intolerance', haven)).toBe(true);
  });
});

describe('allowedLocationIds()', () => {
  it('returns the assigned locations, or all for organization-wide roles', () => {
    const all = [haven.id, kade.id];
    const waiter: Principal = {
      userId: 'u',
      grants: [{ organizationId: 'org-a', locationId: kade.id, role: 'WAITER' }],
    };
    const owner: Principal = {
      userId: 'o',
      grants: [{ organizationId: 'org-a', locationId: null, role: 'OWNER' }],
    };
    expect(allowedLocationIds(waiter, 'org-a', all)).toEqual([kade.id]);
    expect(allowedLocationIds(owner, 'org-a', all)).toEqual(all);
    expect(allowedLocationIds(owner, 'org-b', all)).toEqual([]);
  });
});
