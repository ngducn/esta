import type { Locale } from '@esta/core/format';
import { normalizeUrl } from '@esta/core/research';
import { z } from 'zod';
import type { RunSheet } from './fact-sheet';
import { parseToolInput, ToolRejection } from './server';
import { checkQuotes, pageDate, quoteLabels, quoteNumbers, refusedQuotes, type FetchedPage } from './web-quotes';

const inputSchema = z.strictObject({ url: z.string(), quotes: z.array(z.string()).min(1).max(5) });

/** `quote_page` (AGENT.md §4): the source record of a page WebFetch returned in this turn, with the quotes that match its text. It writes nothing. */
export function quotePageTool({ fetched, cite, locale }: { readonly fetched: ReadonlyMap<string, FetchedPage>; readonly cite: RunSheet['cite']; readonly locale: Locale }) {
  return async (raw: Record<string, unknown>): Promise<unknown> => {
    const { url, quotes } = parseToolInput(inputSchema, raw, 'quote_page takes {"url", "quotes"}');
    const key = normalizeUrl(url);
    const page = key.ok ? fetched.get(key.value) : undefined;
    if (page === undefined) throw new ToolRejection('WebFetch did not read this page in this turn, so it cannot be quoted. Fetch it first; a page from an earlier turn must be fetched again.');
    const checked = checkQuotes(quotes, page.text);
    const labels = quoteLabels(checked);
    const refused = refusedQuotes(checked);
    if (labels.length === 0) throw new ToolRejection(`${refused.join('\n')}\nCopy each quote exactly from the page.`);
    const date = pageDate(page.text, locale);
    const host = new URL(page.link).hostname.replace(/^www\./u, '');
    const record = cite({ source_name: host, source_url: page.link, published_on: date?.on ?? null, ...(date === null ? {} : { published_display: date.display }), ...Object.fromEntries(labels), ...Object.fromEntries(quoteNumbers(checked, locale)) });
    return refused.length === 0 ? record : { ...record, refused };
  };
}
