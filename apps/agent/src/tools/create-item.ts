import type { Clock } from '@esta/core';
import { watchNoteSchema } from '@esta/core/agent-schemas';
import { noteRelatedOf } from '@esta/core/assistant';
import type { IsoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import { checkNote, repairMessage, type FactSheet, type FilledNote, type NoteFormat, type NoteViolation } from '@esta/core/guard';
import type { TablesInsert } from '@esta/db';
import { WATCH_SEVERITIES, watchDedupeKey, type DescribedFact, type WatchSeverity } from '@esta/core/watch';
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

/** The highest severity among the facts an item tells. */
export const severityOf = (facts: readonly DescribedFact[]): WatchSeverity => WATCH_SEVERITIES[Math.max(0, ...facts.map(({ fact }) => WATCH_SEVERITIES.indexOf(fact.severity)))] ?? 'info';

const GUARD_ITEM = {
  vi: { title: 'Trợ lý đã giữ lại một ghi chú có số tự gõ', found: 'Chỗ bộ lọc số chặn:', draft: 'Bản nháp của Trợ lý:' },
  en: { title: 'The assistant held back a note with typed numbers', found: 'What the number guard rejected:', draft: "The assistant's draft:" },
} as const satisfies Record<Locale, Record<string, string>>;

/** A fence longer than any run of backticks in `text`, so the draft shows as written. */
function fenced(text: string): string {
  const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(([run]) => run.length + 1)));
  return `${fence}\n${text}\n${fence}`;
}

export type GuardBinding = Pick<NoteBinding, 'db' | 'householdId' | 'jobId' | 'locale' | 'sheet' | 'clock'>;

export async function writeGuardItem(binding: GuardBinding, draft: string, found: readonly NoteViolation[]): Promise<void> {
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

export type ItemRow = Pick<TablesInsert<'agent_items'>, 'kind' | 'severity' | 'title' | 'body_md' | 'related' | 'dedupe_key' | 'proposal' | 'citations'>;

/** A text the model wrote; `linked` is the same text with its record links swapped in, which the guard reads and fills (§5.6). */
export type GuardedText = { readonly template: string; readonly format: NoteFormat; readonly linked?: string };

/**
 * The number guard as every write tool runs it (AGENT.md §6.3). `fill` checks all of a call's texts against the run's
 * sheet: the first call with a violation gets a repair turn, the next fails the job and leaves the operator note.
 * `save` writes one item for the household under its dedupe key, so a rerun the same day adds nothing; it answers
 * whether it added the row.
 */
export function guardedWriter(binding: GuardBinding, tool: string) {
  let violations = 0;
  return {
    async fill(texts: readonly GuardedText[], draft: string): Promise<FilledNote[]> {
      const checks = texts.map(({ template, format, linked }) => checkNote(template, binding.sheet, format, linked));
      const found = checks.flatMap((check) => (check.ok ? [] : check.reason));
      if (found.length > 0) {
        violations += 1;
        if (violations === 1) throw new ToolRejection(`${repairMessage(found)}\nFix these and call ${tool} again.`);
        await writeGuardItem(binding, draft, found);
        throw new NumberGuardError(`number_guard: ${tool} still held text the number guard rejects after its repair turn; the operator note has it`);
      }
      return checks.flatMap((check) => (check.ok ? [check.value] : []));
    },
    async save(item: ItemRow): Promise<boolean> {
      const { data, error } = await binding.db
        .from('agent_items')
        .upsert({ ...item, household_id: binding.householdId, audience: 'all', job_id: binding.jobId, created_at: (await binding.clock()).now() }, { onConflict: 'household_id,dedupe_key', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error(`${tool} failed: ${error.message}`);
      return data.length > 0;
    },
  };
}

const handles = (list: readonly string[]) => list.join(', ');

/**
 * `create_item` for portfolio_watch. The model names the facts a note covers; the tool sets the note's severity from
 * them and its dedupe key from its one action fact, or the day's digest key, so a rerun on the same day adds nothing
 * (AGENT.md §5.3). The title (plain text) and the body (Markdown) pass the number guard before anything is written.
 */
export function watchNoteWriter(binding: NoteBinding) {
  const covered = new Set<string>();
  const written: WrittenNote[] = [];
  const guard = guardedWriter(binding, 'create_item');
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
    // An action note is keyed by its one fact, so a rerun that groups the facts another way finds the note it wrote.
    if (action !== undefined && related.length > 1) throw new ToolRejection(`${handles(related)}: a note about an action fact relates that fact alone. Write one note for each action fact, and put the watch and info facts in the grouped note.`);
    if (action === undefined && digest) throw new ToolRejection('This run already wrote the grouped note. Put every watch and info fact in that one note.');

    const [title, body] = await guard.fill(
      [
        { template: note.title, format: 'plain' },
        { template: note.body_md, format: 'markdown' },
      ],
      `${note.title}\n\n${note.body_md}`,
    );
    const dedupeKey = action === undefined ? `watch_digest:${binding.asOf}` : watchDedupeKey(action.fact, binding.asOf);
    const added = await guard.save({
      kind: 'alert',
      severity: severityOf(facts),
      title: title?.text ?? '',
      body_md: body?.text ?? '',
      related: noteRelatedOf(facts.map(({ fact }) => fact), facts.map(({ link }) => link)),
      dedupe_key: dedupeKey,
    });
    console.log(`[agent] create_item ok ${dedupeKey}`);
    for (const handle of related) covered.add(handle);
    if (action === undefined) digest = true;
    written.push({ dedupe_key: dedupeKey, title: note.title, body_md: note.body_md, cited: [...(title?.cited ?? []), ...(body?.cited ?? [])], added });
    return { saved: true };
  }

  return { write, covered: covered as ReadonlySet<string>, written: written as readonly WrittenNote[] };
}
