import type { Database } from '@esta/db';

export type Role = Database['public']['Enums']['member_role'];

/**
 * What each role may see and do in the UI and in routing, in one place. RLS is the real guard: this table only decides which
 * screens and buttons a member is shown, so a viewer is not offered an action the database would refuse.
 */
const CAPABILITIES = {
  edit: { roles: ['admin', 'member'], note: 'Add, change and archive records. A viewer reads only.' },
  tenants: { roles: ['admin'], note: 'Tenant pages and their personal details.' },
  import: { roles: ['admin'], note: 'Bank statement import and reconciliation.' },
  export: { roles: ['admin'], note: 'Download the household data.' },
  household: { roles: ['admin'], note: 'Members, receiving accounts, invites and the first-run checklist.' },
  operate: { roles: ['admin', 'member', 'viewer'], operator: true, note: 'Ryan\'s pages: diagnostics, the audit history and the assistant\'s extra effort.' },
} as const satisfies Record<string, { readonly roles: readonly Role[]; readonly operator?: true; readonly note: string }>;

export type Capability = keyof typeof CAPABILITIES;

export type AccessSubject = { readonly role: Role; readonly isOperator?: boolean };

export const CAPABILITY_NAMES = Object.keys(CAPABILITIES) as readonly Capability[];

export function can({ role, isOperator = false }: AccessSubject, capability: Capability): boolean {
  const rule: { readonly roles: readonly Role[]; readonly operator?: true } = CAPABILITIES[capability];
  return rule.roles.includes(role) && (rule.operator !== true || isOperator);
}
