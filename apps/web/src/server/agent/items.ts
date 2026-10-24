import 'server-only';
import { parseInstant, type Instant } from '@esta/core';
import { existingLinks } from '@esta/ops';
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
  readonly reviewHref: string | null;
  readonly isBrief: boolean;
  /** For operators only: what the worker wrote, and whether each `esta://` link names a record this member can read. */
  readonly diagnostics: NoteDiagnostics | null;
};

export type NoteDiagnostics = {
  readonly kind: string;
  readonly severity: string;
  readonly audience: string;
  readonly dedupeKey: string;
  readonly links: ReadonlyArray<{ readonly href: string; readonly ok: boolean }>;
};

const relatedLinks = z.object({ links: z.array(z.string()) });

const fields = z.object({ status: z.enum(INBOX), audience: z.enum(['all', 'operator']) });
const related = z.object({ document_id: z.uuid(), extraction_id: z.uuid() });

/** Every member's inbox, newest first, except that the newest brief leads (DESIGN-BRIEF §6.11). */
export async function listInbox({ household, role, isOperator }: Pick<Member, 'household' | 'role' | 'isOperator'>): Promise<InboxNote[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('agent_items')
    .select('id, title, body_md, status, audience, created_at, proposal, related, kind, severity, dedupe_key')
    .eq('household_id', household.id)
    .in('status', INBOX)
    .order('created_at', { ascending: false })
    .order('id')
    .limit(50);
  if (error) throw new Error(`Reading the assistant inbox failed: ${error.message}`);
  const linksOf = (row: (typeof data)[number]) => relatedLinks.safeParse(row.related).data?.links ?? [];
  const readable = isOperator ? await existingLinks(supabase, household.id, data.flatMap(linksOf)) : new Set<string>();
  const newestBrief = data.find((row) => row.kind === 'brief');
  const inOrder = newestBrief === undefined ? data : [newestBrief, ...data.filter((row) => row !== newestBrief)];
  return inOrder.map((row) => {
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
      isBrief: row.kind === 'brief',
      diagnostics: isOperator
        ? { kind: row.kind, severity: row.severity, audience, dedupeKey: row.dedupe_key, links: linksOf(row).map((href) => ({ href, ok: readable.has(href) })) }
        : null,
    };
  });
}

export type LatestBrief = { readonly title: string; readonly createdAt: Instant };

/** The newest morning brief: Home shows its summary on its own day, and its time says when Trợ lý last ran. */
export async function latestBrief(householdId: string): Promise<LatestBrief | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from('agent_items').select('title, created_at').eq('household_id', householdId).eq('kind', 'brief').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Reading the morning brief failed: ${error.message}`);
  return data === null ? null : { title: data.title, createdAt: parseInstant(data.created_at) };
}
