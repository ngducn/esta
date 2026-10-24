import { z } from 'zod';
import type { Locale } from '../format';
import { escapeMarkdown } from '../guard';
import { parseEstaUri } from '../links/esta-uri';
import { factHandleSchema } from './portfolio-watch';
import { oneLine, wordCount } from './text';

export const MAX_BRIEF_TOKENS = 300;

const draftLineSchema = z.object({ text: oneLine(300), related: z.array(factHandleSchema).min(1).max(10) }).strict();

export const MAX_MARKET_LINES = 3;

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

const marketLineSchema = z.object({
  text: z.string().min(1),
  source: z.object({ name: z.string().min(1), date: z.string().min(1), url: z.string().regex(/^https:\/\/[^\s<>]+$/, 'an https link') }),
});

/** A stored research item's title, which passed the number guard when the scan wrote it, with the source chip that opens the article. */
export type MarketLine = z.infer<typeof marketLineSchema>;

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
  readonly market: readonly MarketLine[];
  readonly missing_inputs: readonly string[];
};

type RenderedLine = { readonly text: string; readonly link?: string; readonly source?: MarketLine['source'] };

const sectionLines = (brief: Brief, key: SectionKey): readonly RenderedLine[] =>
  key === 'missing_inputs' ? brief.missing_inputs.map((text) => ({ text })) : brief[key];

const chipText = ({ name, date }: MarketLine['source']) => `${name} · ${date}`;

const sections = (brief: Brief) =>
  BRIEF_SECTIONS.map(({ key, heading }) => ({ heading: heading[brief.locale], lines: sectionLines(brief, key) })).filter(({ lines }) => lines.length > 0);

/** Whitespace-separated words as the brief reads: the summary, each heading and each line. */
export function briefTokens(brief: Brief): number {
  const text = [brief.summary, ...sections(brief).flatMap(({ heading, lines }) => [heading, ...lines.map((line) => (line.source === undefined ? line.text : `${line.text} ${chipText(line.source)}`))])].join(' ');
  return wordCount(text);
}

/** The filled brief the job stores: its summary is the note's title and `renderBriefMarkdown` writes its body. */
export const briefV1Schema = z
  .object({
    locale: z.enum(['vi', 'en']),
    summary: z.string().min(1).max(300),
    todo: z.array(lineSchema).max(5),
    watch: z.array(lineSchema).max(5),
    market: z.array(marketLineSchema).max(MAX_MARKET_LINES),
    missing_inputs: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((brief, context) => {
    const tokens = briefTokens(brief);
    if (tokens > MAX_BRIEF_TOKENS) context.addIssue({ code: 'custom', message: `${tokens} words > ${MAX_BRIEF_TOKENS}` });
  });

export type BriefV1 = z.infer<typeof briefV1Schema>;

function renderLine({ text, link, source }: RenderedLine): string {
  if (source !== undefined) return `- ${escapeMarkdown(text)} [${escapeMarkdown(chipText(source))}](<${source.url}>)`;
  return link === undefined ? `- ${escapeMarkdown(text)}` : `- [${escapeMarkdown(text)}](${link})`;
}

/** Bold headings and one list item per line, each linked to its record or its source, with every character of the text shown as written. */
export function renderBriefMarkdown(brief: BriefV1): string {
  return sections(brief)
    .map(({ heading, lines }) => [`**${heading}**`, '', ...lines.map(renderLine)].join('\n'))
    .join('\n\n');
}
