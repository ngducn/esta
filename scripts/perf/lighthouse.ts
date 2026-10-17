import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { clearMailbox, latestCode, slotMailbox } from '../inbucket-code.ts';
import { parseSlot, slotPorts } from '../slot.ts';
import { startH2Proxy } from './h2-proxy.ts';

const USAGE =
  'Usage: tsx scripts/perf/lighthouse.ts <route> --email <member email> [--base <origin>] [--http1] [--runs 5] [--label head] [--out <dir for the JSON reports>]\n' +
  'Runs Lighthouse 12.8.2 mobile on a running production server, signed in as the member, and prints the medians.\n' +
  'Measures over HTTP/2 through a local TLS proxy in front of the server (production serves HTTP/2); --http1 measures the server directly.';
const LIGHTHOUSE = 'lighthouse@12.8.2';

type Run = { protocol: string; lcp: number; tbt: number; cls: number; scriptBytes: number; imageBytes: number };

export function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? Number.NaN) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

type Report = {
  audits: Record<string, { numericValue?: number; details?: { items?: { resourceType?: string; transferSize?: number; url?: string; protocol?: string }[] } }>;
};

function summarize(report: Report, origin: string): Run {
  const requests = report.audits['network-requests']?.details?.items ?? [];
  const bytes = (type: string, sameOrigin: boolean) =>
    requests
      .filter((item) => item.resourceType === type && (!sameOrigin || item.url?.startsWith(origin)))
      .reduce((sum, item) => sum + (item.transferSize ?? 0), 0);
  const document = requests.find((item) => item.resourceType === 'Document');
  return {
    protocol: document?.protocol ?? 'unknown',
    lcp: report.audits['largest-contentful-paint']?.numericValue ?? Number.NaN,
    tbt: report.audits['total-blocking-time']?.numericValue ?? Number.NaN,
    cls: report.audits['cumulative-layout-shift']?.numericValue ?? Number.NaN,
    scriptBytes: bytes('Script', true),
    imageBytes: bytes('Image', false),
  };
}

async function sessionCookie(origin: string, email: string, slot: number): Promise<string> {
  const mailbox = slotMailbox(slot);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true });
    await clearMailbox(email, mailbox);
    await page.goto(`${origin}/sign-in`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('button[value="send"]').click();
    await page.locator('input[name="code"]').fill(await latestCode(email, mailbox));
    await page.locator('button[value="verify"]').click();
    await page.waitForURL((url) => url.pathname !== '/sign-in');
    const cookies = await page.context().cookies(origin);
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  } finally {
    await browser.close();
  }
}

export type Medians = { protocol: string; route: string; runs: number; lcpMs: number; tbtMs: number; cls: number; scriptKb: number; imageKb: number };

export type MeasureOptions = { route: string; email: string; slot: number; base?: string; http1?: boolean; runs?: number; label?: string; out?: string };

/** Runs Lighthouse `runs` times on `route`, printing one JSON line per run, and returns the medians. */
export async function measure({ route, email, slot, base, http1 = false, runs = 5, label, out }: MeasureOptions): Promise<Medians> {
  const server = base ?? `http://localhost:${slotPorts(slot).webProd}`;
  const proxy = http1 ? undefined : await startH2Proxy({ slot, upstream: new URL(server).host });
  const origin = proxy?.origin ?? server;
  const chromeFlags = ['--headless=new', ...(proxy ? [`--ignore-certificate-errors-spki-list=${proxy.spkiHash}`] : [])].join(' ');
  const workdir = mkdtempSync(join(tmpdir(), 'esta-lighthouse-'));
  try {
    const headers = join(workdir, 'headers.json');
    writeFileSync(headers, JSON.stringify({ Cookie: await sessionCookie(origin, email, slot) }));
    const results: Run[] = [];
    for (let index = 0; index < runs; index++) {
      const output = join(out ?? workdir, `${label ?? 'run'}-${index + 1}.json`);
      const lighthouse = spawnSync(
        'npx',
        [
          '-y',
          LIGHTHOUSE,
          `${origin}${route}`,
          '--quiet',
          '--only-categories=performance',
          '--output=json',
          `--output-path=${output}`,
          `--extra-headers=${headers}`,
          `--chrome-flags=${chromeFlags}`,
        ],
        { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CHROME_PATH: process.env.CHROME_PATH ?? chromium.executablePath() } },
      );
      if (lighthouse.status !== 0) throw new Error(`lighthouse exited with ${lighthouse.status}`);
      const result = summarize(JSON.parse(readFileSync(output, 'utf8')) as Report, origin);
      results.push(result);
      console.log(JSON.stringify({ label: label ?? 'run', route, email, run: index + 1, ...result }));
    }
    const pick = (key: Exclude<keyof Run, 'protocol'>) => median(results.map((result) => result[key]));
    return {
      protocol: [...new Set(results.map((result) => result.protocol))].join(','),
      route,
      runs,
      lcpMs: Math.round(pick('lcp')),
      tbtMs: Math.round(pick('tbt')),
      cls: Number(pick('cls').toFixed(3)),
      scriptKb: Math.round(pick('scriptBytes') / 1024),
      imageKb: Math.round(pick('imageBytes') / 1024),
    };
  } finally {
    proxy?.stop();
    rmSync(workdir, { recursive: true, force: true });
  }
}

async function run(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { email: { type: 'string' }, base: { type: 'string' }, runs: { type: 'string' }, label: { type: 'string' }, http1: { type: 'boolean' }, out: { type: 'string' } },
  });
  const [route] = positionals;
  if (route === undefined || values.email === undefined) throw new Error(USAGE);
  const medians = await measure({
    route,
    email: values.email,
    slot: parseSlot(process.env.ESTA_SLOT),
    ...(values.base === undefined ? {} : { base: values.base }),
    http1: values.http1 ?? false,
    runs: Number(values.runs ?? '5'),
    ...(values.label === undefined ? {} : { label: values.label }),
    ...(values.out === undefined ? {} : { out: values.out }),
  });
  const { protocol, route: measured, ...rest } = medians;
  console.log(JSON.stringify({ label: values.label ?? 'median', protocol, route: measured, email: values.email, ...rest }));
}

if (import.meta.main) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
