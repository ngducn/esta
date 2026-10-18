import type { Database } from '@esta/db';
import { z } from 'zod';

type MemberRole = Database['public']['Enums']['member_role'];

const RANK: Readonly<Record<MemberRole, number>> = { viewer: 0, member: 1, admin: 2 };

const retryProposal = z.object({ type: z.literal('retry_job'), min_role: z.enum(['viewer', 'member', 'admin']) });

/** `self` when this member may run the item's Retry, `ask` when only a higher role may, null when the item offers none. */
export type RetryHint = 'self' | 'ask';

export function retryHint(proposal: unknown, role: MemberRole): RetryHint | null {
  const parsed = retryProposal.safeParse(proposal);
  if (!parsed.success) return null;
  return RANK[role] >= RANK[parsed.data.min_role] ? 'self' : 'ask';
}
