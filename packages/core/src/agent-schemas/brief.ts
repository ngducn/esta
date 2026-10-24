import { z } from 'zod';
import type { Locale } from '../format';
import { escapeMarkdown } from '../guard';
import { parseEstaUri } from '../links/esta-uri';
import { factHandleSchema } from './portfolio-watch';

export const MAX_BRIEF_TOKENS = 300;

const oneLine = (max: number) => z.string().trim().min(1).max(max).regex(/^[^\r\n]*$/, 'one line');

const draftLineSchema = z.object({ text: oneLine(300), related: z.array(factHandleSchema).min(1).max(10) }).strict();

/** What `create_brief` takes from the model: plain-text templates with placeholders, each line naming the facts it tells (AGENT.md §5.4). */
export const briefDraftSchema = z
  .object({
    summary: oneLine(200),
    todo: z.array(draftLineSchema).max(5),
    watch: z.array(draftLineSchema).max(5),
  })
  .strict();

export type BriefDraft = z.infer<typeof briefDraftSchema>;

const lineSchema = z.object({
  text: z.string().min(1),
  link: z.string().refine((link) => parseEstaUri(link).ok, 'an esta:// link to a record'),
});

/** A filled line as it reads, linked to the record it tells. */
export type BriefLine = z.infer<typeof lineSchema>;

type SectionKey = 'todo' | 'watch' | 'market' | 'missing_inputs';

/** The brief's sections in the order they render. */
export const BRIEF_SECTIONS: ReadonlyArray<{ readonly key: SectionKey; readonly heading: Readonly<Record<Locale, string>> }> = [
  { key: 'todo', heading: { vi: 'Cần làm', en: 'To do' } },
  { key: 'watch', heading: { vi: 'Theo dõi', en: 'Keep an eye on' } },
  { key: 'market', heading: { vi: 'Thị trường', en: 'Market' } },
  { key: 'missing_inputs', heading: { vi: 'Còn thiếu', en: 'Not in yet' } },
];

type Brief = {
  readonly locale: Locale;
  readonly summary: string;
  readonly todo: readonly BriefLine[];
  readonly watch: readonly BriefLine[];
  readonly market: readonly BriefLine[];
  readonly missing_inputs: readonly string[];
};

const sectionLines = (brief: Brief, key: SectionKey): ReadonlyArray<{ readonly text: string; readonly link?: string }> =>
  key === 'missing_inputs' ? brief.missing_inputs.map((text) => ({ text })) : brief[key];

const sections = (brief: Brief) =>
  BRIEF_SECTIONS.map(({ key, heading }) => ({ heading: heading[brief.locale], lines: sectionLines(brief, key) })).filter(({ lines }) => lines.length > 0);

/** Whitespace-separated words as the brief reads: the summary, each heading and each line. */
export function briefTokens(brief: Brief): number {
  const text = [brief.summary, ...sections(brief).flatMap(({ heading, lines }) => [heading, ...lines.map((line) => line.text)])].join(' ');
  return text.split(/\s+/u).filter(Boolean).length;
}

/** The filled brief the job stores: its summary is the note's title and `renderBriefMarkdown` writes its body. */
export const briefV1Schema = z
  .object({
    locale: z.enum(['vi', 'en']),
    summary: z.string().min(1).max(300),
    todo: z.array(lineSchema).max(5),
    watch: z.array(lineSchema).max(5),
    market: z.array(lineSchema).max(3),
    missing_inputs: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((brief, context) => {
    const tokens = briefTokens(brief);
    if (tokens > MAX_BRIEF_TOKENS) context.addIssue({ code: 'custom', message: `${tokens} words > ${MAX_BRIEF_TOKENS}` });
  });

export type BriefV1 = z.infer<typeof briefV1Schema>;

/** Bold headings and one list item per line, each linked to its record, with every character of the text shown as written. */
export function renderBriefMarkdown(brief: BriefV1): string {
  return sections(brief)
    .map(({ heading, lines }) => [`**${heading}**`, '', ...lines.map(({ text, link }) => (link === undefined ? `- ${escapeMarkdown(text)}` : `- [${escapeMarkdown(text)}](${link})`))].join('\n'))
    .join('\n\n');
}
