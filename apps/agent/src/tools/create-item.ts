import type { Clock } from '@esta/core';
import { watchNoteSchema } from '@esta/core/agent-schemas';
import type { IsoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import { checkNote, repairMessage, type FactSheet, type FilledNote, type NoteViolation } from '@esta/core/guard';
import { watchDedupeKey, type DescribedFact, type WatchSeverity } from '@esta/core/watch';
import type { AgentDb } from '../supabase';
import { ToolRejection } from './server';

/** A note still broke the number guard after its one repair turn, which a retry of the same model turns cannot fix. */
export class NumberGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NumberGuardError';
  }
}

export type NoteBinding = {
  readonly db: AgentDb;
  readonly householdId: string;
  readonly jobId: string;
  readonly locale: Locale;
  readonly asOf: IsoDate;
  readonly sheet: FactSheet;
  /** The watch facts this run read, by handle. */
  readonly facts: ReadonlyMap<string, DescribedFact>;
  clock(): Promise<Clock>;
};

/** What the job result keeps of each note for audit: the model's templates and the values that filled them (AGENT.md §6.3). */
export type WrittenNote = { readonly dedupe_key: string; readonly title: string; readonly body_md: string; readonly cited: Array<FilledNote['cited'][number]>; readonly added: boolean };

const SEVERITY_ORDER: readonly WatchSeverity[] = ['info', 'watch', 'action'];

const GUARD_ITEM = {
  vi: { title: 'Trợ lý đã giữ lại một ghi chú có số tự gõ', found: 'Chỗ bộ lọc số chặn:', draft: 'Bản nháp của Trợ lý:' },
  en: { title: 'The assistant held back a note with typed numbers', found: 'What the number guard rejected:', draft: "The assistant's draft:" },
} as const satisfies Record<Locale, Record<string, string>>;

/** A fence longer than any run of backticks in `text`, so the draft shows as written. */
function fenced(text: string): string {
  const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(([run]) => run.length + 1)));
  return `${fence}\n${text}\n${fence}`;
}

export type GuardItemBinding = Pick<NoteBinding, 'db' | 'householdId' | 'jobId' | 'locale' | 'clock'>;

/** The operator-only item a note's second guard violation leaves, with the model's draft as written (AGENT.md §6.3). */
export async function writeGuardItem(binding: GuardItemBinding, draft: string, found: readonly NoteViolation[]): Promise<void> {
  const words = GUARD_ITEM[binding.locale];
  const once = new Map(found.map((violation) => [`${violation.rule}\u0000${violation.text}`, violation]));
  const list = [...once.values()].map(({ rule, text }) => `- ${JSON.stringify(text)}: ${rule}`).join('\n');
  const { error } = await binding.db.from('agent_items').upsert(
    {
      household_id: binding.householdId,
      kind: 'system',
      severity: 'info',
      audience: 'operator',
      title: words.title,
      body_md: `${words.found}\n\n${list}\n\n${words.draft}\n\n${fenced(draft)}`,
      dedupe_key: `number_guard:${binding.jobId}`,
      job_id: binding.jobId,
      created_at: (await binding.clock()).now(),
    },
    { onConflict: 'household_id,dedupe_key', ignoreDuplicates: true },
  );
  if (error) throw new Error(`Writing the number guard item failed: ${error.message}`);
}

const handles = (list: readonly string[]) => list.join(', ');

/**
 * `create_item` for portfolio_watch. The model names the facts a note covers; the tool sets the note's severity from
 * them and its dedupe key from its first action fact, or the day's digest key, so a rerun on the same day adds nothing
 * (AGENT.md §5.3). The title (plain text) and the body (Markdown) pass the number guard before anything is written.
 */
export function watchNoteWriter(binding: NoteBinding) {
  const covered = new Set<string>();
  const written: WrittenNote[] = [];
  let violations = 0;
  let digest = false;

  async function write(raw: Record<string, unknown>): Promise<{ saved: true }> {
    const parsed = watchNoteSchema.safeParse(raw);
    if (!parsed.success) throw new ToolRejection(`The note does not match create_item:\n${parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n')}`);
    const note = parsed.data;
    const related = [...new Set(note.related)];
    const unknown = related.filter((handle) => !binding.facts.has(handle));
    if (unknown.length > 0) throw new ToolRejection(`${handles(unknown)}: not a fact watch_facts returned in this run. Relate only the facts it returned.`);
    const again = related.filter((handle) => covered.has(handle));
    if (again.length > 0) throw new ToolRejection(`${handles(again)}: already in a note of this run. Relate each fact to one note.`);
    const facts = related.flatMap((handle) => binding.facts.get(handle) ?? []);
    const action = facts.find(({ fact }) => fact.severity === 'action');
    if (action === undefined && digest) throw new ToolRejection('This run already wrote the grouped note. Put every watch and info fact in that one note.');

    const title = checkNote(note.title, binding.sheet, 'plain');
    const body = checkNote(note.body_md, binding.sheet);
    if (!title.ok || !body.ok) {
      const found = [...(title.ok ? [] : title.reason), ...(body.ok ? [] : body.reason)];
      violations += 1;
      if (violations === 1) throw new ToolRejection(`${repairMessage(found)}\nFix these and call create_item again.`);
      await writeGuardItem(binding, `${note.title}\n\n${note.body_md}`, found);
      throw new NumberGuardError('number_guard: a note still held text the number guard rejects after its repair turn; the operator note has it');
    }

    const dedupeKey = action === undefined ? `watch_digest:${binding.asOf}` : watchDedupeKey(action.fact, binding.asOf);
    const severity = SEVERITY_ORDER[Math.max(...facts.map(({ fact }) => SEVERITY_ORDER.indexOf(fact.severity)))] ?? 'info';
    const { data, error } = await binding.db
      .from('agent_items')
      .upsert(
        {
          household_id: binding.householdId,
          kind: 'alert',
          severity,
          audience: 'all',
          title: title.value.text,
          body_md: body.value.text,
          related: { facts: facts.map(({ fact }) => ({ rule_id: fact.ruleId, subject_key: fact.subjectKey })), links: facts.map(({ link }) => link) },
          dedupe_key: dedupeKey,
          job_id: binding.jobId,
          created_at: (await binding.clock()).now(),
        },
        { onConflict: 'household_id,dedupe_key', ignoreDuplicates: true },
      )
      .select('id');
    if (error) throw new Error(`create_item failed: ${error.message}`);
    for (const handle of related) covered.add(handle);
    if (action === undefined) digest = true;
    written.push({ dedupe_key: dedupeKey, title: note.title, body_md: note.body_md, cited: [...title.value.cited, ...body.value.cited], added: data.length > 0 });
    return { saved: true };
  }

  return { write, covered: covered as ReadonlySet<string>, written: written as readonly WrittenNote[] };
}
