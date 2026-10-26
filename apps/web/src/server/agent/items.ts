import 'server-only';
import { parseInstant, type Instant, type IsoDate } from '@esta/core';
import type { WatchSeverity } from '@esta/core/watch';
import { parseProposal, type Proposal } from '@esta/core/proposals';
import { existingLinks, idSchema } from '@esta/ops';
import { z } from 'zod';
import type { Member } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';
import { noteCitations, type NoteCitation } from './citations';
import { canonicalStamp, inWindow, type Cursor, type Window } from './thread-cursor';
import { retryHint, type RetryHint } from './retry-hint';

const INBOX = ['new', 'read'] as const;
export type InboxStatus = (typeof INBOX)[number];
const STATUSES = [...INBOX, 'approved', 'failed', 'dismissed', 'done'] as const;
export type NoteStatus = (typeof STATUSES)[number];

/** A proposal as the registry reads its stored params, null when they no longer parse. */
export type ProposalView = { readonly parsed: Proposal | null; readonly dueOn: IsoDate | null };

export type InboxNote = {
  readonly id: string;
  readonly title: string;
  readonly bodyMd: string | null;
  readonly status: NoteStatus;
  readonly operatorOnly: boolean;
  readonly createdAt: Instant;
  readonly cursor: Cursor;
  readonly retry: RetryHint | null;
  readonly reviewHref: string | null;
  readonly kind: NoteKind;
  readonly proposal: ProposalView | null;
  readonly citations: readonly NoteCitation[];
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

const noteKind = z.enum(['brief', 'weekly', 'proposal', 'note']).catch('note');
export type NoteKind = z.infer<typeof noteKind>;

const relatedLinks = z.object({ links: z.array(z.string()) });

const fields = z.object({ status: z.enum(STATUSES), audience: z.enum(['all', 'operator']) });
const related = z.object({ document_id: z.uuid(), extraction_id: z.uuid() });

function proposalView(raw: unknown): ProposalView {
  const proposal = parseProposal(raw);
  if (!proposal.ok) return { parsed: null, dueOn: null };
  return { parsed: proposal.value, dueOn: proposal.value.type === 'create_task' ? proposal.value.params.due_on : null };
}

const NOTE_FIELDS = 'id, title, body_md, status, audience, created_at, proposal, related, citations, kind, severity, dedupe_key';

/** A page of the notes RLS lets this member read, every status, from the window's cursor outward (P5-12). */
export async function listNotes({ household, role, isOperator }: Pick<Member, 'household' | 'role' | 'isOperator'>, window: Window): Promise<InboxNote[]> {
  const supabase = await createSessionClient();
  const { data, error } = await inWindow(supabase.from('agent_items').select(NOTE_FIELDS).eq('household_id', household.id), 0, window);
  if (error) throw new Error(`Reading Trợ lý's notes failed: ${error.message}`);
  const linksOf = (row: (typeof data)[number]) => relatedLinks.safeParse(row.related).data?.links ?? [];
  const readable = isOperator ? await existingLinks(supabase, household.id, data.flatMap(linksOf)) : new Set<string>();
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
      cursor: { stamp: canonicalStamp(row.created_at), rank: 0, id: row.id },
      retry: retryHint(row.proposal, role),
      reviewHref: document.success ? `/documents/${document.data.document_id}/review` : null,
      kind: noteKind.parse(row.kind),
      proposal: row.kind === 'proposal' ? proposalView(row.proposal) : null,
      citations: noteCitations(row.citations),
      diagnostics: isOperator
        ? { kind: row.kind, severity: row.severity, audience, dedupeKey: row.dedupe_key, links: linksOf(row).map((href) => ({ href, ok: readable.has(href) })) }
        : null,
    };
  });
}

export type PinnedNote = { readonly id: string; readonly title: string; readonly proposal: boolean };

export type Pinned = { readonly shown: readonly PinnedNote[]; readonly count: number };

const PINNED_SHOWN = 3;

const SEVERITY_RANK: Record<WatchSeverity, number> = { action: 0, watch: 1, info: 2 };
const severity = z.enum(['info', 'watch', 'action']);
const NEVER_PINNED_KINDS = '(brief,weekly)';

type PinnedCandidate = { readonly rank: number; readonly key: string };
const mostSevereThenNewest = (a: PinnedCandidate, b: PinnedCandidate) => a.rank - b.rank || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0);

export async function listPinned(householdId: string): Promise<Pinned> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('agent_items')
    .select('id, title, kind, severity, created_at')
    .eq('household_id', householdId)
    .in('status', INBOX)
    .not('kind', 'in', NEVER_PINNED_KINDS)
    .or('kind.eq.proposal,severity.eq.action');
  if (error) throw new Error(`Reading Trợ lý's open notes failed: ${error.message}`);
  const open = data
    .map((row) => ({ row, rank: SEVERITY_RANK[severity.parse(row.severity)], key: `${canonicalStamp(row.created_at)} ${row.id}` }))
    .toSorted(mostSevereThenNewest);
  return { shown: open.slice(0, PINNED_SHOWN).map(({ row }) => ({ id: row.id, title: row.title, proposal: row.kind === 'proposal' })), count: open.length };
}

/** Where a note this member may read sits in the thread, or null. */
export async function noteCursor(householdId: string, id: string): Promise<Cursor | null> {
  if (!idSchema.safeParse(id).success) return null;
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from('agent_items').select('created_at').eq('household_id', householdId).eq('id', id).maybeSingle();
  if (error) throw new Error(`Reading the note failed: ${error.message}`);
  return data === null ? null : { stamp: canonicalStamp(data.created_at), rank: 0, id };
}

export type LatestBrief = { readonly id: string; readonly title: string; readonly createdAt: Instant };

/** The newest morning brief as of the clock: Home shows its summary on its own day, and its time says when Trợ lý last ran. */
export async function latestBrief(householdId: string, asOf: Instant): Promise<LatestBrief | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('agent_items')
    .select('id, title, created_at')
    .eq('household_id', householdId)
    .eq('kind', 'brief')
    .lte('created_at', asOf)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Reading the morning brief failed: ${error.message}`);
  return data === null ? null : { id: data.id, title: data.title, createdAt: parseInstant(data.created_at) };
}

export const isOpen = (status: NoteStatus): status is InboxStatus => status === 'new' || status === 'read';
