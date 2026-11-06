import { chromium, type Page } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPEN_ROUTES, APP_ROUTES, type OpenRoute } from '../e2e/routes.ts';
import { startAs, THEMES, VIEWERS, visit } from '../e2e/helpers/app-routes.ts';
import { parseSlot, slotPorts } from './slot.ts';

const OUT = process.env.SCREENS_OUT ?? '/tmp/swarm-p6-04/screens';
const SIZES = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;
const TARGET_PX = 44;
const ONLY = process.env.SCREENS_ONLY?.split(',');
const ENGLISH = /\b(the|and|with|your|please|loading|save|cancel|delete|edit|search|error|try again|back|next|add|settings|home)\b/i;

type Finding = { kind: 'sideways-scroll' | 'small-target' | 'clipped-text' | 'english'; detail: string };

async function inspect(page: Page, phone: boolean): Promise<Finding[]> {
  return page.evaluate(
    ({ phone, target, english }) => {
      const out: { kind: Finding['kind']; detail: string }[] = [];
      const doc = document.documentElement;
      if (doc.scrollWidth > doc.clientWidth) out.push({ kind: 'sideways-scroll', detail: `${doc.scrollWidth} > ${doc.clientWidth}` });
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const label = (element: Element) => `${element.tagName.toLowerCase()} "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)}"`;
      if (phone) {
        for (const element of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=link]')) {
          if (!visible(element) || (element as HTMLInputElement).disabled) continue;
          const style = getComputedStyle(element);
          if (style.display === 'inline' && element.tagName === 'A') continue;
          const stretched = getComputedStyle(element, '::after').position === 'absolute' && element.parentElement !== null;
          const box = stretched ? ((element as HTMLElement).offsetParent ?? element) : (element.closest('label') ?? element);
          const rect = box.getBoundingClientRect();
          if (rect.width <= 2 || rect.height <= 2) continue;
          if (rect.height < target) out.push({ kind: 'small-target', detail: `${label(element)} is ${Math.round(rect.width)} x ${Math.round(rect.height)}` });
        }
      }
      for (const element of document.querySelectorAll('main *, header *, nav *')) {
        if (!visible(element) || element.children.length > 0 || !element.textContent?.trim()) continue;
        const box = element.getBoundingClientRect();
        if (box.width <= 2 || box.height <= 2) continue;
        const style = getComputedStyle(element);
        const clips = style.overflowX === 'hidden' || style.overflowX === 'clip';
        if (clips && element.scrollWidth > element.clientWidth + 1 && style.textOverflow !== 'ellipsis') out.push({ kind: 'clipped-text', detail: label(element) });
      }
      const text = document.body.innerText;
      const found = new RegExp(english, 'i').exec(text);
      if (document.documentElement.lang === 'vi' && found !== null) out.push({ kind: 'english', detail: `"${found[0]}"` });
      return out;
    },
    { phone, target: TARGET_PX, english: ENGLISH.source },
  );
}

/** The five routes Mẹ opens daily, shot at 390 x 844 in Vietnamese under one bad condition: `fault`, `offline`, `slow` or `scale` (130% text). */
const DAILY = ['home', 'properties', 'collections', 'documents', 'assistant'];
type State = 'fault' | 'offline' | 'slow' | 'scale';

async function inState(state: State, baseURL: string): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: SIZES[0], baseURL, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.addInitScript('window.__name = (target) => target');
  await startAs(page, baseURL, 'member', 'light');
  const rows: { file: string; id: string; findings: Finding[] }[] = [];
  const shoot = async (route: OpenRoute, suffix = '') => {
    const file = `${route.id}-${state}${suffix}.png`;
    const findings = await inspect(page, true);
    await page.screenshot({ path: join(OUT, file), fullPage: true });
    rows.push({ file, id: route.id, findings });
    console.log(`${file} ${findings.length}`);
  };
  try {
    for (const route of OPEN_ROUTES.filter((entry) => DAILY.includes(entry.id) && entry.viewer === 'member')) {
      if (state === 'fault') {
        await context.addCookies([{ name: 'esta_fault', value: 'reads', url: baseURL }]);
        await page.goto(route.path);
        await page.getByRole('alert').first().waitFor({ timeout: 30_000 });
        await shoot(route);
        await context.clearCookies({ name: 'esta_fault' });
      } else if (state === 'offline') {
        await page.goto(route.path);
        await page.locator('main h1, main h2').first().waitFor();
        await context.setOffline(true);
        await page.waitForTimeout(600);
        await shoot(route);
        const other = DAILY.find((id) => id !== route.id) ?? 'home';
        await page.getByRole('navigation').getByRole('link').first().click({ trial: true }).catch(() => undefined);
        await page.goto(OPEN_ROUTES.find((entry) => entry.id === other)?.path ?? '/').catch(() => undefined);
        await context.setOffline(false);
      } else if (state === 'slow') {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1200, downloadThroughput: 60_000, uploadThroughput: 60_000 });
        await page.goto(route.path, { waitUntil: 'commit' });
        await page.waitForTimeout(2500);
        await shoot(route, '-loading');
        await page.locator('main h1, main h2').first().waitFor({ timeout: 90_000 });
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      } else {
        await visit(page, route);
        await page.evaluate(() => document.documentElement.setAttribute('data-text-scale', '130'));
        await page.waitForTimeout(400);
        await shoot(route);
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(join(OUT, `${state}.json`), JSON.stringify(rows, null, 1));
  if (rows.some((row) => row.findings.length > 0)) process.exitCode = 1;
}

async function main() {
  const state = process.env.SCREENS_STATE as State | undefined;
  if (state !== undefined) return inState(state, `http://localhost:${slotPorts(parseSlot(process.env.ESTA_SLOT)).web}`);
  const slot = parseSlot(process.env.ESTA_SLOT);
  const baseURL = `http://localhost:${slotPorts(slot).web}`;
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const rows: { file: string; id: string; width: number; theme: string; findings: Finding[] }[] = [];
  try {
    for (const size of SIZES) {
      for (const theme of THEMES) {
        const context = await browser.newContext({ viewport: size, baseURL, ...(size.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
        const page = await context.newPage();
        await page.addInitScript('window.__name = (target) => target');
        for (const viewer of VIEWERS) {
          await startAs(page, baseURL, viewer, theme);
          for (const route of OPEN_ROUTES.filter((entry) => entry.viewer === viewer && (ONLY === undefined || ONLY.includes(entry.id)))) {
            await visit(page, route);
            await page.waitForTimeout(400);
            const file = `${route.id}-${size.width}-${theme}.png`;
            const findings = await inspect(page, size.width < 500);
            await page.screenshot({ path: join(OUT, file), fullPage: true });
            rows.push({ file, id: route.id, width: size.width, theme, findings });
            console.log(`${file} ${rows.at(-1)?.findings.length ?? 0}`);
          }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  const skipped = APP_ROUTES.filter((entry) => entry.skip !== undefined);
  const cell = (row: (typeof rows)[number]) =>
    `<figure><a href="${row.file}"><img src="${row.file}" loading="lazy" width="${row.width === 390 ? 195 : 360}"></a><figcaption>${row.width} ${row.theme}${row.findings.length ? `<ul>${row.findings.map((f) => `<li>${f.kind}: ${f.detail}</li>`).join('')}</ul>` : ' ok'}</figcaption></figure>`;
  const ids = [...new Set(rows.map((row) => row.id))];
  const html = `<!doctype html><meta charset="utf-8"><title>screens</title><style>body{font:13px system-ui;margin:16px}section{margin:0 0 24px}figure{display:inline-block;vertical-align:top;margin:4px;max-width:380px}img{border:1px solid #ccc}li{color:#b00020}</style>
<h1>${ids.length} routes, ${rows.length} screens, ${rows.filter((row) => row.findings.length > 0).length} with findings</h1>
${ids.map((id) => `<section><h2>${id}</h2>${rows.filter((row) => row.id === id).map(cell).join('')}</section>`).join('\n')}
<h2>Not opened</h2><ul>${skipped.map((entry) => `<li>${entry.page}: ${entry.skip}</li>`).join('')}</ul>`;
  writeFileSync(join(OUT, 'index.html'), html);
  writeFileSync(join(OUT, 'findings.json'), JSON.stringify(rows.filter((row) => row.findings.length > 0), null, 1));
  console.log(`index: ${join(OUT, 'index.html')}`);
  const flagged = rows.filter((row) => row.findings.length > 0).length;
  if (flagged > 0) {
    console.error(`${flagged} screens have findings; see ${join(OUT, 'findings.json')}`);
    process.exitCode = 1;
  }
}

await main();
