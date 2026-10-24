import type { Result } from '../result';

/** Query keys that only say how a reader arrived, so two links to one article differ by them alone. */
const TRACKING = /^(utm_[a-z0-9_]+|fbclid|gclid|gbraid|wbraid|msclkid|zarsrc|zaloapp|igshid|mc_cid|mc_eid|_ga|_gl|ref|ref_src|cmpid|share)$/i;

function queryKey(pair: string): string {
  const raw = pair.split('=')[0] ?? '';
  try {
    return decodeURIComponent(raw.replaceAll('+', ' '));
  } catch {
    return raw;
  }
}

/**
 * The form `research_items.url_normalized` stores, so one article read through two links dedupes (AGENT.md §5.2):
 * `https:` only, no `www.`, no fragment, no tracking parameters, the other parameters sorted, no trailing slash.
 */
export function normalizeUrl(raw: string): Result<string, 'not_url' | 'not_https'> {
  const url = URL.parse(raw.trim());
  if (url === null || url.hostname === '') return { ok: false, reason: 'not_url' };
  if (url.protocol !== 'https:') return { ok: false, reason: 'not_https' };
  const host = url.hostname.replace(/^www\./, '');
  const port = url.port === '' ? '' : `:${url.port}`;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '';
  const query = url.search
    .slice(1)
    .split('&')
    .filter((pair) => pair !== '' && !TRACKING.test(queryKey(pair)))
    .toSorted();
  return { ok: true, value: `https://${host}${port}${path}${query.length === 0 ? '' : `?${query.join('&')}`}` };
}
