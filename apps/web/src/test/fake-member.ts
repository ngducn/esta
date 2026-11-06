import { can, type Role } from '@/server/access';

/** A signed-in member for a test that stands in for `requireMember`, with the real capability table behind `can`. */
export function fakeMember(role: Role, householdId: string, isOperator = false) {
  return { role, isOperator, household: { id: householdId, name: 'Gia đình Demo' }, can: (capability: Parameters<typeof can>[1]) => can({ role, isOperator }, capability) };
}

export type FakeMember = ReturnType<typeof fakeMember>;
