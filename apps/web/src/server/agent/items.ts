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
  readonly reviewHref: string | null;
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

/** The table each `esta://{type}/{id}` link names (AGENT.md §5.6). */
const LINK_TABLES = {
  invoice: 'invoices',
  lease: 'leases',
  unit: 'units',
  document: 'documents',
  meter: 'meters',
  party: 'parties',
  property: 'properties',
} as const;

const LINK = /^esta:\/\/([a-z]+)\/([0-9a-f-]{36})$/;
const relatedLinks = z.object({ links: z.array(z.string()) });

/** The links whose record RLS lets this member read, by one read per table the links name. */
async function readableLinks(supabase: Awaited<ReturnType<typeof createSessionClient>>, links: readonly string[]): Promise<ReadonlySet<string>> {
  const ids = new Map<keyof typeof LINK_TABLES, string[]>();
  for (const link of links) {
    const [, type = '', id = ''] = LINK.exec(link) ?? [];
    if (Object.hasOwn(LINK_TABLES, type)) ids.set(type as keyof typeof LINK_TABLES, [...(ids.get(type as keyof typeof LINK_TABLES) ?? []), id]);
  }
  const found = await Promise.all(
    [...ids].map(async ([type, list]) => {
      const { data, error } = await supabase.from(LINK_TABLES[type]).select('id').in('id', list);
      if (error) throw new Error(`Checking the assistant's links failed: ${error.message}`);
      return data.map((row) => `esta://${type}/${row.id}`);
    }),
  );
  return new Set(found.flat());
}

const fields = z.object({ status: z.enum(INBOX), audience: z.enum(['all', 'operator']) });
const related = z.object({ document_id: z.uuid(), extraction_id: z.uuid() });

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
  const readable = isOperator ? await readableLinks(supabase, data.flatMap(linksOf)) : new Set<string>();
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
      diagnostics: isOperator
        ? { kind: row.kind, severity: row.severity, audience, dedupeKey: row.dedupe_key, links: linksOf(row).map((href) => ({ href, ok: readable.has(href) })) }
        : null,
    };
  });
}
