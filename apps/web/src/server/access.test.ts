import { describe, expect, it } from 'vitest';
import { CAPABILITY_NAMES, can, type Role } from './access';

const ROLES: readonly Role[] = ['viewer', 'member', 'admin'];

describe('can', () => {
  it('gives every capability the same answer for a role as the SPEC roles table', () => {
    const grid = Object.fromEntries(ROLES.map((role) => [role, CAPABILITY_NAMES.filter((capability) => can({ role }, capability))]));

    expect(grid).toEqual({
      viewer: [],
      member: ['edit'],
      admin: ['edit', 'tenants', 'import', 'export', 'household'],
    });
  });

  it.each(ROLES)('opens the operator pages to a %s only with the operator flag', (role) => {
    expect(can({ role }, 'operate')).toBe(false);
    expect(can({ role, isOperator: false }, 'operate')).toBe(false);
    expect(can({ role, isOperator: true }, 'operate')).toBe(true);
  });
});
