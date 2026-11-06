import { can, type Role } from '../server/access';

const CAPABILITY_ROLES: readonly Role[] = ['viewer', 'member', 'admin'];

/** A signed-in member for a test that stands in for `requireMember`, with the real capability table behind `can`. */
export function fakeMember(role: Role, householdId: string, isOperator = false) {
  return { role, isOperator, household: { id: householdId, name: 'Gia đình Demo' }, can: (capability: Parameters<typeof can>[1]) => can({ role, isOperator }, capability) };
}

export type FakeMember = ReturnType<typeof fakeMember>;

/** A test's bare `{ role, household }` member with the real capability table behind `can`. */
export function withCapabilities(member: { role: string; household: { id: string } }) {
  const role = CAPABILITY_ROLES.find((known) => known === member.role);
  if (role === undefined) throw new Error(`unknown role ${member.role}`);
  return fakeMember(role, member.household.id);
}
