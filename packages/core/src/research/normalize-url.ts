import type { Result } from '../result';

const TRACKING = /^(utm_[a-z0-9_]+|fbclid|gclid|gbraid|wbraid|msclkid|zarsrc|zaloapp|igshid|mc_cid|mc_eid|_ga|_gl|ref|ref_src|cmpid|share)$/i;

function queryKey(pair: string): string {
  const raw = pair.split('=')[0] ?? '';
  try {
    return decodeURIComponent(raw.replaceAll('+', ' '));
  } catch {
    return raw;
  }
}

/** A pair that only asks for the AMP copy of a page: `?amp`, `?amp=1`, `?amp_js`, `?output=amp`, `?outputType=amp`. */
function asksForAmp(pair: string): boolean {
  const [key = '', value = ''] = pair.split('=');
  const name = queryKey(key).toLowerCase();
  return name.startsWith('amp') || ((name === 'output' || name === 'outputtype') && value.toLowerCase() === 'amp');
}

/** The page behind an AMP copy: an `amp.` host, an `/amp` path segment, `.amp` before the extension, and the AMP query pairs. */
function withoutAmp(host: string, path: string): { host: string; path: string } {
  const segments = path.split('/').filter((segment, index) => index === 0 || segment.toLowerCase() !== 'amp');
  return { host: host.replace(/^amp\./i, ''), path: segments.join('/').replace(/\.amp(?=\.[a-z0-9]+$|$)/i, '') };
}

function httpsUrl(raw: string): Result<{ readonly url: URL; readonly port: string; readonly query: string[] }, 'not_url' | 'not_https'> {
  const url = URL.parse(raw.trim());
  if (url === null || url.hostname === '') return { ok: false, reason: 'not_url' };
  if (url.protocol !== 'https:') return { ok: false, reason: 'not_https' };
  const query = url.search
    .slice(1)
    .split('&')
    .filter((pair) => pair !== '' && !TRACKING.test(queryKey(pair)));
  return { ok: true, value: { url, port: url.port === '' ? '' : `:${url.port}`, query } };
}

const search = (query: readonly string[]) => (query.length === 0 ? '' : `?${query.join('&')}`);

/** The form `research_items.url_normalized` stores (AGENT.md §5.2). */
export function normalizeUrl(raw: string): Result<string, 'not_url' | 'not_https'> {
  const parsed = httpsUrl(raw);
  if (!parsed.ok) return parsed;
  const { url, port, query } = parsed.value;
  const { host, path } = withoutAmp(url.hostname.replace(/^www\./, ''), url.pathname);
  const folded = path.length > 1 ? path.replace(/\/+$/, '') : '';
  return { ok: true, value: `https://${host}${port}${folded}${search(query.filter((pair) => !asksForAmp(pair)).toSorted())}` };
}

/** The link `research_items.source_url` stores: as the page was read, `www.` and a trailing slash kept, without tracking or a fragment (#329). */
export function sourceLink(raw: string): Result<string, 'not_url' | 'not_https'> {
  const parsed = httpsUrl(raw);
  if (!parsed.ok) return parsed;
  const { url, port, query } = parsed.value;
  return { ok: true, value: `https://${url.hostname}${port}${url.pathname}${search(query)}` };
}

/** The form a WebFetch link must share with a link this run's WebSearch returned: only host case, `www.`, port 443, a trailing slash and the fragment fold, so no query or userinfo can carry data to the host (#323). */
export function fetchKey(raw: string): Result<string, 'not_url' | 'not_https' | 'userinfo'> {
  const url = URL.parse(raw.trim());
  if (url === null || url.hostname === '') return { ok: false, reason: 'not_url' };
  if (url.protocol !== 'https:') return { ok: false, reason: 'not_https' };
  if (url.username !== '' || url.password !== '') return { ok: false, reason: 'userinfo' };
  const port = url.port === '' ? '' : `:${url.port}`;
  return { ok: true, value: `https://${url.hostname.replace(/^www\./, '')}${port}${url.pathname.replace(/\/+$/, '')}${url.search}` };
}

/** `research_items.source_url` holds at most this many characters. */
export const MAX_SOURCE_LINK = 2000;

/** The link the page ended on after redirects, or, when that is too long for the column, the link the model cited. */
export function storedSourceLink(landed: string, cited: string): string {
  if (landed.length <= MAX_SOURCE_LINK) return landed;
  const link = sourceLink(cited);
  return link.ok && link.value.length <= MAX_SOURCE_LINK ? link.value : cited;
}
