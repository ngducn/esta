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

/** The form `research_items.url_normalized` stores (AGENT.md §5.2). */
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

/** The form a WebFetch link must share with a link this run's WebSearch returned: only host case, `www.`, port 443, a trailing slash and the fragment fold, so no query or userinfo can carry data to the host (#323). */
export function fetchKey(raw: string): Result<string, 'not_url' | 'not_https' | 'userinfo'> {
  const url = URL.parse(raw.trim());
  if (url === null || url.hostname === '') return { ok: false, reason: 'not_url' };
  if (url.protocol !== 'https:') return { ok: false, reason: 'not_https' };
  if (url.username !== '' || url.password !== '') return { ok: false, reason: 'userinfo' };
  const port = url.port === '' ? '' : `:${url.port}`;
  return { ok: true, value: `https://${url.hostname.replace(/^www\./, '')}${port}${url.pathname.replace(/\/+$/, '')}${url.search}` };
}
