import 'server-only';
import { lookup as systemLookup } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { isShortMapsLink, isUnderMapsPath, parseMapsUrl, type MapsLinkParse } from '@esta/core/maps';
import type { Result } from '@esta/core/result';
import { Agent, fetch, type Dispatcher } from 'undici';
import { vetAddress } from './address-policy';

export type ResolveError =
  | 'host_not_allowed'
  | 'not_https'
  | 'private_address'
  | 'redirect_not_allowed'
  | 'too_many_redirects'
  | 'no_redirect'
  | 'timeout'
  | 'unreachable';

export type ResolvedMapsLink = Exclude<MapsLinkParse, { kind: 'short_link' }>;

export interface ResolveDeps {
  readonly dispatcher: Dispatcher;
}

const MAX_HOPS = 5;
const TIMEOUT_MS = 3000;
const TERMINAL_HOSTS = new Set(['google.com', 'www.google.com']);

class AddressRefusedError extends Error {}

/** Asks for every answer, refuses the whole set if any one is not public, and hands the socket only vetted addresses. */
export function guardedLookup(lookup: LookupFunction): LookupFunction {
  return (hostname, options, callback) => {
    lookup(hostname, { ...options, all: true }, (error, answers) => {
      if (error) return callback(error, '');
      const vetted = typeof answers === 'string' ? [] : answers;
      const [first] = vetted;
      if (first === undefined || vetted.some(({ address }) => vetAddress(address) === 'refused')) {
        return callback(new AddressRefusedError(`maps.resolve refused an address for ${hostname}`), '');
      }
      if (options.all) callback(null, vetted);
      else callback(null, first.address, first.family);
    });
  };
}

export function guardedAgent(lookup: LookupFunction = systemLookup): Agent {
  return new Agent({
    connect: { lookup: guardedLookup(lookup), timeout: TIMEOUT_MS },
    headersTimeout: TIMEOUT_MS,
    bodyTimeout: TIMEOUT_MS,
    maxResponseSize: 64 * 1024,
  });
}

let sharedAgent: Agent | undefined;

function parseUrl(input: string, base?: URL): URL | undefined {
  try {
    return new URL(input, base);
  } catch {
    return undefined;
  }
}

function isBareOrigin(url: URL): boolean {
  return url.username === '' && url.password === '' && url.port === '';
}

function isTerminal(url: URL): boolean {
  return url.protocol === 'https:' && TERMINAL_HOSTS.has(url.hostname) && isBareOrigin(url) && isUnderMapsPath(url.pathname);
}

function isFollowable(url: URL): boolean {
  return url.protocol === 'https:' && isShortMapsLink(url) && isBareOrigin(url);
}

function causedByRefusal(error: unknown): boolean {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (cause instanceof AddressRefusedError) return true;
  }
  return false;
}

function refuse(reason: ResolveError): Result<ResolvedMapsLink, ResolveError> {
  return { ok: false, reason };
}

async function follow(start: URL, dispatcher: Dispatcher): Promise<Result<ResolvedMapsLink, ResolveError>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let current = start;
    for (let hop = 1; hop <= MAX_HOPS; hop += 1) {
      const response = await fetch(current, { redirect: 'manual', dispatcher, signal: controller.signal });
      console.info(`maps.resolve hop=${hop} host=${current.hostname} status=${response.status}`);
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (response.status < 300 || response.status > 399 || location === null) return refuse('no_redirect');
      const next = parseUrl(location, current);
      if (next !== undefined && isTerminal(next)) {
        const parsed = parseMapsUrl(next.href);
        return parsed.kind === 'short_link' ? refuse('redirect_not_allowed') : { ok: true, value: parsed };
      }
      if (next === undefined || !isFollowable(next)) return refuse('redirect_not_allowed');
      current = next;
    }
    return refuse('too_many_redirects');
  } catch (error) {
    if (controller.signal.aborted) return refuse('timeout');
    return refuse(causedByRefusal(error) ? 'private_address' : 'unreachable');
  } finally {
    clearTimeout(timer);
  }
}

function startUrl(input: string): Result<URL, ResolveError> {
  const url = parseUrl(input);
  if (url === undefined || !isShortMapsLink(url) || !isBareOrigin(url)) return { ok: false, reason: 'host_not_allowed' };
  if (url.protocol !== 'https:') return { ok: false, reason: 'not_https' };
  return { ok: true, value: url };
}

/**
 * Follows a `maps.app.goo.gl` or `goo.gl/maps` link to the Google Maps URL it names and parses that URL
 * without fetching it. P1-09's server action is the only intended caller.
 */
export async function resolveShortMapsLink(
  input: string,
  deps: ResolveDeps = { dispatcher: (sharedAgent ??= guardedAgent()) },
): Promise<Result<ResolvedMapsLink, ResolveError>> {
  const start = startUrl(input);
  const result = start.ok ? await follow(start.value, deps.dispatcher) : start;
  console.info(`maps.resolve result=${result.ok ? 'ok' : result.reason}`);
  return result;
}
