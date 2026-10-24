import { briefDraftSchema, briefV1Schema, renderBriefMarkdown, type BriefDraft, type BriefLine } from '@esta/core/agent-schemas';
import type { FilledNote } from '@esta/core/guard';
import type { DescribedFact } from '@esta/core/watch';
import { existingLinks } from '@esta/ops';
import { guardedWriter, severityOf, type NoteBinding } from './create-item';
import { ToolRejection } from './server';

export type BriefBinding = NoteBinding & {
  /** One line per input the brief waited for and went without, in the household's language (AGENT.md §3). */
  readonly missingInputs: readonly string[];
};

/** What the job result keeps of the brief for audit: the model's draft and the values that filled it (AGENT.md §6.3). */
export type WrittenBrief = { readonly dedupe_key: string; readonly draft: BriefDraft; readonly cited: Array<FilledNote['cited'][number]>; readonly left_out: string[]; readonly added: boolean };

const SECTION_ROOM = { todo: 5, watch: 5 } as const;
/** `agent_items.title` holds at most 300 characters. */
const MAX_TITLE = 300;

const rejected = (lines: readonly string[]) => new ToolRejection(`${lines.join('\n')}\nFix these and call create_brief again.`);

/** Facts the brief must tell while its section has room: every action fact under todo, every watch fact under todo or watch. */
function untold(draft: BriefDraft, facts: ReadonlyMap<string, DescribedFact>): string[] {
  const told = (lines: BriefDraft['todo']) => new Set(lines.flatMap((line) => line.related));
  const [todo, either] = [told(draft.todo), told([...draft.todo, ...draft.watch])];
  return [...facts].flatMap(([handle, { fact }]) => {
    if (fact.severity === 'action' && draft.todo.length < SECTION_ROOM.todo && !todo.has(handle)) return [`${handle} (${fact.ruleId}): an action fact; give it a line under todo.`];
    if (fact.severity === 'watch' && draft.watch.length < SECTION_ROOM.watch && !either.has(handle)) return [`${handle} (${fact.ruleId}): a watch fact; give it a line under watch.`];
    return [];
  });
}

/**
 * `create_brief` for morning_brief. Each line names the facts it tells and links to the first one's record; the summary
 * and every line pass the number guard as plain text through the same writer as create_item, and the job stores the
 * summary as the title and the sections as the body, one brief per day.
 */
export function briefWriter(binding: BriefBinding) {
  const guard = guardedWriter(binding, 'create_brief');
  let saved: WrittenBrief | null = null;

  async function write(raw: Record<string, unknown>): Promise<{ saved: true }> {
    if (saved !== null) throw new ToolRejection('This run already saved the brief.');
    const parsed = briefDraftSchema.safeParse(raw);
    if (!parsed.success) throw rejected(parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`));
    const draft = parsed.data;
    const lines = [...draft.todo, ...draft.watch];
    const unknown = [...new Set(lines.flatMap((line) => line.related))].filter((handle) => !binding.facts.has(handle));
    if (unknown.length > 0) throw rejected([`${unknown.join(', ')}: not a fact a tool returned in this run. Relate only facts your tools returned.`]);
    const missing = untold(draft, binding.facts);
    if (missing.length > 0) throw rejected(missing);

    const [summary, ...texts] = await guard.fill(
      [draft.summary, ...lines.map((line) => line.text)].map((template) => ({ template, format: 'plain' as const })),
      JSON.stringify(draft, null, 2),
    );
    const filled = lines.map((line, i): BriefLine => ({ text: texts[i]?.text ?? '', link: binding.facts.get(line.related[0] ?? '')?.link ?? '' }));
    const title = summary?.text ?? '';
    if (title.length > MAX_TITLE) throw rejected([`summary: ${title.length} characters once filled > ${MAX_TITLE}. Shorten it.`]);
    const brief = briefV1Schema.safeParse({
      locale: binding.locale,
      summary: title,
      todo: filled.slice(0, draft.todo.length),
      watch: filled.slice(draft.todo.length),
      market: [],
      missing_inputs: binding.missingInputs,
    });
    if (!brief.success) throw rejected(brief.error.issues.map((issue) => `${issue.path.join('.') || 'brief'}: ${issue.message}. Shorten the brief.`));

    const links = [...new Set(filled.map((line) => line.link))];
    const present = await existingLinks(binding.db, binding.householdId, links);
    const dead = links.filter((link) => !present.has(link));
    if (dead.length > 0) throw new Error(`The brief links to records the household does not have: ${dead.join(', ')}`);

    const told = new Set(lines.flatMap((line) => line.related));
    const facts = [...told].flatMap((handle) => binding.facts.get(handle) ?? []);
    const dedupeKey = `brief:${binding.asOf}`;
    const added = await guard.save({
      kind: 'brief',
      severity: severityOf(facts),
      title,
      body_md: renderBriefMarkdown(brief.data),
      related: { facts: facts.map(({ fact }) => ({ rule_id: fact.ruleId, subject_key: fact.subjectKey })), links },
      dedupe_key: dedupeKey,
    });
    const leftOut = [...binding.facts].filter(([handle]) => !told.has(handle)).map(([handle, { fact }]) => `${handle} (${fact.ruleId})`);
    saved = { dedupe_key: dedupeKey, draft, cited: [summary, ...texts].flatMap((note) => note?.cited ?? []), left_out: leftOut, added };
    return { saved: true };
  }

  return { write, saved: () => saved };
}
