import { formatDate, type Locale } from '@esta/core/format';
import { normalizeUrl, quoteOnPage, MIN_QUOTE_WORDS, sourceLink } from '@esta/core/research';
import { publishedDates } from '@esta/core/parse/page-dates';
import { z } from 'zod';
import type { BuiltInResult } from '../sdk/session';
import { ToolRejection } from './server';

/** A page WebFetch read in this run: its text, the link it ended on, which `research_items.source_url` stores, and every normalized link it was reached by, so a redirect's two ends name one article. */
export type FetchedPage = { readonly text: string; readonly link: string; readonly urls: readonly string[] };

const fetchResult = z.object({ code: z.number(), result: z.string(), url: z.string().optional() });

/**
 * A WebFetch call that read its page: the page text, under its link as asked and as it ended after any redirect,
 * normalized, and the link it ended on as `research_items.source_url` stores it.
 */
export function fetchedPage({ name, input, result }: BuiltInResult): FetchedPage | null {
  const page = fetchResult.safeParse(result);
  if (name !== 'WebFetch' || !page.success || page.data.code < 200 || page.data.code > 299) return null;
  const links = [page.data.url, input.url].flatMap((link) => (typeof link === 'string' ? [link] : []));
  const urls = links.flatMap((link) => {
    const url = normalizeUrl(link);
    return url.ok ? [url.value] : [];
  });
  const read = links.map(sourceLink).find((link) => link.ok);
  return read?.ok === true ? { urls, text: page.data.result, link: read.value } : null;
}

const QUOTE_REFUSAL = {
  too_short: `a figure is quoted with the words around it, at least ${MIN_QUOTE_WORDS} words`,
  not_on_page: 'not on the page WebFetch returned as whole words',
} as const;

export type CheckedQuote = { readonly quote: string; readonly found: ReturnType<typeof quoteOnPage> };

export const checkQuotes = (quotes: readonly string[], page: string): CheckedQuote[] => quotes.map((quote) => ({ quote, found: quoteOnPage(quote, page) }));

/** One line per quote that does not match the page, with the reason. */
export const refusedQuotes = (checked: readonly CheckedQuote[]): string[] => checked.flatMap(({ quote, found }) => (found.ok ? [] : [`${JSON.stringify(quote)}: ${QUOTE_REFUSAL[found.reason]}`]));

/** `quote_n_label` for each quote that matched, numbered by its place in the list. */
export const quoteLabels = (checked: readonly CheckedQuote[]): Array<[string, string]> => checked.flatMap(({ found }, i) => (found.ok ? [[`quote_${i + 1}_label`, found.value] as [string, string]] : []));

/** The quotes all matching, or a rejection naming each that did not. */
export function requireQuotes(quotes: readonly string[], page: string): Array<[string, string]> {
  const checked = checkQuotes(quotes, page);
  const refused = refusedQuotes(checked);
  if (refused.length > 0) throw new ToolRejection(`${refused.join('\n')}\nCopy each quote exactly from the page, or leave it out.`);
  return quoteLabels(checked);
}

export function pageDate(text: string, locale: Locale): { readonly on: string; readonly display: string } | null {
  const [first] = publishedDates(text);
  return first === undefined ? null : { on: first, display: formatDate(first, locale) };
}
