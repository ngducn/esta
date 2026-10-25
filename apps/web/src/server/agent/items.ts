import 'server-only';
import { businessDate, parseInstant, type Instant, type IsoDate } from '@esta/core';
import { addDays } from '@esta/core/date/calendar';
import { parseProposal, type Proposal } from '@esta/core/proposals';
import { existingLinks } from '@esta/ops';
import { z } from 'zod';
import { env } from '@/server/env';
import type { Member } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';
import { retryHint, type RetryHint } from './retry-hint';

const INBOX = ['new', 'read'] as const;
export type InboxStatus = (typeof INBOX)[number];
const DECIDED = ['approved', 'failed'] as const;
export type NoteStatus = InboxStatus | (typeof DECIDED)[number];

/** A proposal as the registry reads its stored params, null when they no longer parse. */
export type ProposalView = { readonly parsed: Proposal | null; readonly dueOn: IsoDate | null };

export type InboxNote = {
  readonly id: string;
  readonly title: string;
  readonly bodyMd: string | null;
  readonly status: NoteStatus;
  readonly operatorOnly: boolean;
  readonly createdAt: Instant;
  readonly retry: RetryHint | null;
  readonly reviewHref: string | null;
  readonly isBrief: boolean;
  readonly proposal: ProposalView | null;
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

const fields = z.object({ status: z.enum([...INBOX, ...DECIDED]), audience: z.enum(['all', 'operator']) });
const related = z.object({ document_id: z.uuid(), extraction_id: z.uuid() });

function proposalView(raw: unknown): ProposalView {
  const proposal = parseProposal(raw);
  if (!proposal.ok) return { parsed: null, dueOn: null };
  return { parsed: proposal.value, dueOn: proposal.value.type === 'create_task' ? proposal.value.params.due_on : null };
}

/**
 * Every member's inbox, newest first, except that the newest brief leads (DESIGN-BRIEF §6.11). A proposal decided on
 * `today` stays, so its card can say what the approval did.
 */
export async function listInbox({ household, role, isOperator }: Pick<Member, 'household' | 'role' | 'isOperator'>, today: IsoDate): Promise<InboxNote[]> {
  const supabase = await createSessionClient();
  const { data: rows, error } = await supabase
    .from('agent_items')
    .select('id, title, body_md, status, audience, created_at, proposal, related, kind, severity, dedupe_key, decided_at')
    .eq('household_id', household.id)
    // The day before `today` at UTC midnight bounds every zone's start of `today`, so old decisions never fill the page.
    .or(`status.in.(${INBOX.join(',')}),and(kind.eq.proposal,status.in.(${DECIDED.join(',')}),decided_at.gte.${addDays(today, -1)}T00:00:00Z)`)
    .order('created_at', { ascending: false })
    .order('id')
    .limit(50);
  if (error) throw new Error(`Reading the assistant inbox failed: ${error.message}`);
  const data = rows.filter((row) => row.decided_at === null || businessDate(parseInstant(row.decided_at), env.ESTA_TIMEZONE) === today);
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
      proposal: row.kind === 'proposal' ? proposalView(row.proposal) : null,
      diagnostics: isOperator
        ? { kind: row.kind, severity: row.severity, audience, dedupeKey: row.dedupe_key, links: linksOf(row).map((href) => ({ href, ok: readable.has(href) })) }
        : null,
    };
  });
}

export type LatestBrief = { readonly title: string; readonly createdAt: Instant };

/** The newest morning brief as of the clock: Home shows its summary on its own day, and its time says when Trợ lý last ran. */
export async function latestBrief(householdId: string, asOf: Instant): Promise<LatestBrief | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('agent_items')
    .select('title, created_at')
    .eq('household_id', householdId)
    .eq('kind', 'brief')
    .lte('created_at', asOf)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Reading the morning brief failed: ${error.message}`);
  return data === null ? null : { title: data.title, createdAt: parseInstant(data.created_at) };
}

export const isOpen = (status: NoteStatus): status is InboxStatus => status === 'new' || status === 'read';
