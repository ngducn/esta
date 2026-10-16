import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import type { LookupFunction } from 'node:net';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MockAgent } from 'undici';
import fixture from '../../../../../fixtures/maps/links.json';

vi.mock('server-only', () => ({}));
const { guardedLookup, resolveShortMapsLink, guardedAgent } = await import('./resolve-short-maps-link');
const { vetAddress } = await import('./address-policy');

interface Hop {
  readonly status: number;
  readonly location?: string;
}

interface Row {
  readonly name: string;
  readonly input: string;
  readonly parse: { readonly kind: string };
  readonly dns?: readonly string[];
  readonly hops?: readonly Hop[];
  readonly resolve?: { readonly ok: boolean; readonly reason?: string };
}

const rows: readonly Row[] = fixture.cases;

function scriptedAgent(input: string, hops: readonly Hop[]) {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const requested: string[] = [];
  let next = new URL(input);
  for (const hop of hops) {
    const target = next;
    agent
      .get(target.origin)
      .intercept({ path: target.pathname + target.search, method: 'GET' })
      .reply(() => {
        requested.push(target.href);
        return { statusCode: hop.status, responseOptions: { headers: hop.location ? { location: hop.location } : {} } };
      });
    if (hop.location !== undefined) next = new URL(hop.location, target);
  }
  return { agent, requested };
}

function fakeLookup(answers: readonly string[]) {
  const asked: string[] = [];
  const lookup: LookupFunction = (hostname, options, callback) => {
    asked.push(hostname);
    const all = answers.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
    if (options.all) callback(null, all);
    else callback(null, all[0]?.address ?? '', all[0]?.family);
  };
  return { lookup, asked };
}

const connected: unknown[] = [];
const onConnected = (message: unknown) => connected.push(message);
let lines: string[] = [];

beforeEach(() => {
  connected.length = 0;
  lines = [];
  subscribe('undici:client:connected', onConnected);
  vi.spyOn(console, 'info').mockImplementation((line: string) => void lines.push(line));
});

afterEach(() => {
  unsubscribe('undici:client:connected', onConnected);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const SHORT_HOST = /^https:\/\/(maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/;

describe('resolveShortMapsLink over fixtures/maps/links.json', () => {
  const scripted = rows.flatMap((row) => (row.resolve && !row.dns ? [[row.name, row, row.resolve] as const] : []));
  test.each(scripted)('%s', async (_name, row, expected) => {
    const { agent, requested } = scriptedAgent(row.input, row.hops ?? []);

    expect(await resolveShortMapsLink(row.input, { dispatcher: agent })).toEqual(expected);
    expect(requested.every((url) => SHORT_HOST.test(url))).toBe(true);
    expect(requested.length).toBeLessThanOrEqual(5);
    expect(lines.at(-1)).toBe(`maps.resolve result=${expected.reason ?? 'ok'}`);
  });

  const dns = rows.flatMap((row) => (row.dns ? [[row.name, row, row.dns] as const] : []));
  test.each(dns)('%s', async (_name, row, answers) => {
    const { lookup, asked } = fakeLookup(answers);

    expect(await resolveShortMapsLink(row.input, { dispatcher: guardedAgent(lookup) })).toEqual(row.resolve);
    expect(asked).toEqual(['maps.app.goo.gl']);
    expect(connected).toEqual([]);
  });

  const terminal = /^https:\/\/(www\.)?google\.com\/maps([/?#]|$)/;
  const locations = rows.filter((row) => row.parse.kind !== 'short_link' && URL.canParse(row.input) && !/\s/.test(row.input));
  test.each(locations.map((row) => [row.name, row] as const))('Location: %s', async (_name, row) => {
    const short = 'https://maps.app.goo.gl/DemoLocation';
    const { agent, requested } = scriptedAgent(short, [{ status: 302, location: row.input }]);

    const expected = terminal.test(row.input) ? { ok: true, value: row.parse } : { ok: false, reason: 'redirect_not_allowed' };
    expect(await resolveShortMapsLink(short, { dispatcher: agent })).toEqual(expected);
    expect(requested).toEqual([short]);
  });
});

describe('resolveShortMapsLink', () => {
  test('logs one line per hop and one outcome line', async () => {
    const { agent } = scriptedAgent('https://maps.app.goo.gl/DemoLog', [
      { status: 302, location: 'https://goo.gl/maps/DemoLog2' },
      { status: 301, location: 'https://www.google.com/maps?q=10.7769,106.7009' },
    ]);

    await resolveShortMapsLink('https://maps.app.goo.gl/DemoLog', { dispatcher: agent });

    expect(lines).toEqual([
      'maps.resolve hop=1 host=maps.app.goo.gl status=302',
      'maps.resolve hop=2 host=goo.gl status=301',
      'maps.resolve result=ok',
    ]);
  });

  test('times out after 3 s across the whole chain', async () => {
    vi.useFakeTimers();
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get('https://maps.app.goo.gl')
      .intercept({ path: '/DemoSlow', method: 'GET' })
      .reply(302, '', { headers: { location: 'https://maps.app.goo.gl/DemoSlow2' } })
      .delay(2000);
    agent
      .get('https://maps.app.goo.gl')
      .intercept({ path: '/DemoSlow2', method: 'GET' })
      .reply(302, '', { headers: { location: 'https://www.google.com/maps?q=10.7769,106.7009' } })
      .delay(2000);

    const pending = resolveShortMapsLink('https://maps.app.goo.gl/DemoSlow', { dispatcher: agent });
    await vi.advanceTimersByTimeAsync(3000);

    expect(await pending).toEqual({ ok: false, reason: 'timeout' });
    expect(lines.at(-1)).toBe('maps.resolve result=timeout');
  });

  test('sends only undici fetch defaults, so no cookie or authorization', async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    const seen: string[][] = [];
    agent
      .get('https://maps.app.goo.gl')
      .intercept({ path: '/DemoHeaders', method: 'GET' })
      .reply((options) => {
        seen.push(Object.keys(options.headers ?? {}).map((name) => name.toLowerCase()));
        return { statusCode: 302, responseOptions: { headers: { location: 'https://www.google.com/maps?q=1,2' } } };
      });

    await resolveShortMapsLink('https://maps.app.goo.gl/DemoHeaders', { dispatcher: agent });

    expect(seen.map((names) => names.toSorted())).toEqual([
      ['accept', 'accept-encoding', 'accept-language', 'sec-fetch-mode', 'user-agent'],
    ]);
  });
});

describe('guardedLookup', () => {
  test('passes only vetted answers and pins the first one', async () => {
    const { lookup } = fakeLookup(['142.250.66.78', '2404:6800:4005:80e::200e']);
    const single = await new Promise((resolve) =>
      guardedLookup(lookup)('maps.app.goo.gl', {}, (error, address, family) => resolve({ error, address, family })),
    );
    const all = await new Promise((resolve) =>
      guardedLookup(lookup)('maps.app.goo.gl', { all: true }, (error, address) => resolve({ error, address })),
    );

    expect(single).toEqual({ error: null, address: '142.250.66.78', family: 4 });
    expect(all).toEqual({
      error: null,
      address: [
        { address: '142.250.66.78', family: 4 },
        { address: '2404:6800:4005:80e::200e', family: 6 },
      ],
    });
  });

  test('an empty answer is refused', async () => {
    const { lookup } = fakeLookup([]);
    const error = await new Promise((resolve) => guardedLookup(lookup)('maps.app.goo.gl', { all: true }, (e) => resolve(e)));

    expect(error).toBeInstanceOf(Error);
  });
});

describe('vetAddress', () => {
  test.each([
    ['142.250.66.78', 'public'],
    ['2404:6800:4005:80e::200e', 'public'],
    ['::ffff:142.250.66.78', 'public'],
    ['10.0.0.1', 'refused'],
    ['172.16.0.1', 'refused'],
    ['192.168.1.1', 'refused'],
    ['127.0.0.1', 'refused'],
    ['169.254.169.254', 'refused'],
    ['100.64.0.1', 'refused'],
    ['0.0.0.0', 'refused'],
    ['224.0.0.1', 'refused'],
    ['255.255.255.255', 'refused'],
    ['::1', 'refused'],
    ['::', 'refused'],
    ['fc00::1', 'refused'],
    ['fd12:3456::1', 'refused'],
    ['fe80::1', 'refused'],
    ['ff02::1', 'refused'],
    ['::ffff:127.0.0.1', 'refused'],
    ['::ffff:10.0.0.1', 'refused'],
    ['::ffff:169.254.169.254', 'refused'],
    ['not-an-ip', 'refused'],
  ])('%s is %s', (ip, verdict) => {
    expect(vetAddress(ip)).toBe(verdict);
  });
});
