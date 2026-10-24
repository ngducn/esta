import 'server-only';
import { parseInstant, type Instant } from '@esta/core';
import { z } from 'zod';
import type { Member } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';
import { retryHint, type RetryHint } from './retry-hint';

const INBOX = ['new', 'read'] as const;
export type InboxStatus = (typeof INBOX)[number];

export type InboxNote = {
  readonly id: string;
  readonly title: string;
  readonly bodyMd: string | null;
  readonly status: InboxStatus;
  readonly operatorOnly: boolean;
  readonly createdAt: Instant;
  readonly retry: RetryHint | null;
  /** The review of the document the note is about, where a read is checked or a failed one is entered by hand. */
  readonly reviewHref: string | null;
};

const fields = z.object({ status: z.enum(INBOX), audience: z.enum(['all', 'operator']) });
const related = z.object({ document_id: z.uuid() });

/**
 * The household's open assistant notes, unread and read, newest first. A hidden note or one already handled leaves the
 * inbox. RLS keeps operator notes to operators (FND-2).
 */
export async function listInbox({ household, role }: Pick<Member, 'household' | 'role'>): Promise<InboxNote[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('agent_items')
    .select('id, title, body_md, status, audience, created_at, proposal, related')
    .eq('household_id', household.id)
    .in('status', INBOX)
    .order('created_at', { ascending: false })
    .order('id')
    .limit(50);
  if (error) throw new Error(`Reading the assistant inbox failed: ${error.message}`);
  return data.map((row) => {
    const { status, audience } = fields.parse(row);
    const document = related.safeParse(row.related);
    return {
      id: row.id,
      title: row.title,
      bodyMd: row.body_md,
      status,
      operatorOnly: audience === 'operator',
      createdAt: parseInstant(row.created_at),
      retry: retryHint(row.proposal, role),
      reviewHref: document.success ? `/documents/${document.data.document_id}/review` : null,
    };
  });
}
