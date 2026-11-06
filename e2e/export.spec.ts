import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { join } from 'node:path';
import { EXPORT_TABLES } from '../packages/core/src/export/tables.ts';
import { query } from '../scripts/db-checksum.ts';
import { e2eServiceHeaders } from '../scripts/e2e-service.ts';
import { localTarget, runSql } from '../scripts/export-source.ts';
import { parseSlot, slotWorkdir } from '../scripts/slot.ts';
import { memberRest } from './helpers/auth-api';
import { laneHousehold } from './helpers/seed';
import { DESKTOP, noSidewaysScroll, open, openNewHousehold, PHONE, rest, seriousAxeViolations, shot } from './helpers/wizard';

const workdir = slotWorkdir(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
const service = e2eServiceHeaders();
const LANE = 9;
const HOUSEHOLD = laneHousehold(LANE);

test.beforeEach(() => {
  const screen = test.info().title.includes('taps Xuất');
  test.skip(!screen && test.info().project.name !== 'desktop', 'an export reads one lane household, so one viewport');
});

type Link = { name: string; url: string };
type Exported = { parts: Link[]; entries: Map<string, Uint8Array>; manifest: Manifest; partEntries: Map<string, string[]> };
type Manifest = {
  schemaVersion: number;
  exportedAt: string;
  householdId: string;
  tables: Record<string, number>;
  files: number;
  parts: string[];
  exporter: { role: string; isOperator: boolean };
  complete: boolean;
  withheld: { table: string; rule: string }[];
};

const text = (entries: Map<string, Uint8Array>, path: string) => strFromU8(entries.get(path) ?? new Uint8Array());

/** Posts to /api/export as the signed-in admin, downloads every part from its signed link and merges their entries. */
async function exportAll(page: Page): Promise<Exported> {
  const response = await page.request.post('/api/export');
  expect(response.status(), await response.text()).toBe(200);
  const body = (await response.json()) as { parts: Link[]; ttlSeconds: number };
  expect(body.ttlSeconds).toBe(300);
  const entries = new Map<string, Uint8Array>();
  const partEntries = new Map<string, string[]>();
  for (const part of body.parts) {
    const download = await page.request.get(part.url);
    expect(download.status()).toBe(200);
    expect(download.headers()['content-disposition']).toContain('attachment');
    const files = unzipSync(new Uint8Array(await download.body()));
    partEntries.set(part.name, Object.keys(files));
    for (const [path, bytes] of Object.entries(files)) entries.set(path, bytes);
  }
  return { parts: body.parts, entries, manifest: JSON.parse(text(entries, 'manifest.json')) as Manifest, partEntries };
}

async function serviceCount(page: Page, table: string, scope: string): Promise<number> {
  const response = await page.request.get(`${rest}/${table}?${scope}=eq.${HOUSEHOLD}&select=id`, { headers: { ...service, prefer: 'count=exact', range: '0-0' } });
  expect(response.ok(), await response.text()).toBe(true);
  return Number(response.headers()['content-range']?.split('/')[1]);
}

/** Taken before the export, which writes its own download rows. */
async function liveCounts(page: Page): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const table of EXPORT_TABLES) counts.set(table.name, await serviceCount(page, table.name, table.scope));
  return counts;
}

const downloads = () => query<{ n: number }>(workdir, `select count(*)::int as n from public.document_access_log where household_id = '${HOUSEHOLD}' and action = 'download'`)[0]?.n ?? 0;

test('Ryan exports the whole household: every table as JSON and CSV, every file, and a manifest the database agrees with (PLT-2)', async ({ page }) => {
  await open(page, `ryan.lane${LANE}@demo.esta.test`, 'light', DESKTOP);
  const live = await liveCounts(page);
  const { entries, manifest, parts, partEntries } = await exportAll(page);

  expect(parts.length, 'ESTA_EXPORT_PART_MB=1 splits a 1.8 MB household').toBeGreaterThan(1);
  expect(parts[0]?.name).toMatch(/^[0-9a-f-]{36}\.zip$/);
  expect(parts[1]?.name).toMatch(/^[0-9a-f-]{36}-part-2\.zip$/);
  expect(manifest.parts).toEqual(parts.map((part) => part.name));
  expect([...partEntries].filter(([, names]) => names.includes('manifest.json')).map(([name]) => name), 'the manifest sits in the last part only').toEqual([parts.at(-1)?.name]);
  expect(manifest).toMatchObject({ schemaVersion: 1, householdId: HOUSEHOLD, exportedAt: '2026-11-01T03:00:00.000Z' });

  for (const table of EXPORT_TABLES) {
    const rows = JSON.parse(text(entries, `tables/${table.name}.json`)) as unknown[];
    expect(rows.length, `${table.name} rows in the JSON`).toBe(manifest.tables[table.name]);
    expect([...(entries.get(`tables/${table.name}.csv`) ?? []).slice(0, 3)], `${table.name} CSV starts with the BOM`).toEqual([0xef, 0xbb, 0xbf]);
    expect(text(entries, `tables/${table.name}.csv`).split('\r\n').length - 2, `${table.name} rows in the CSV`).toBe(rows.length);
    if (table.visibility === 'household') expect(live.get(table.name), `${table.name} against a service-role count taken before the export`).toBe(rows.length);
    else expect(rows.length, `${table.name} is narrowed by its policy, so the export holds at most what the database does`).toBeLessThanOrEqual(live.get(table.name) ?? 0);
  }

  const stored = query<{ n: number }>(workdir, `select count(*)::int as n from storage.objects where bucket_id in ('documents', 'property-photos') and name like '${HOUSEHOLD}/%'`)[0]?.n;
  const files = [...entries.keys()].filter((path) => path.startsWith('files/'));
  expect(files.length).toBe(stored);
  expect(manifest.files).toBe(stored);
  expect(files.every((path) => path.split('/')[2] === HOUSEHOLD), 'every file sits under the household').toBe(true);
});

test('an export names no other household and logs one download per document it holds (DOC-4)', async ({ page }) => {
  await open(page, `ryan.lane${LANE}@demo.esta.test`, 'light', DESKTOP);
  const before = downloads();
  const { entries } = await exportAll(page);

  const others = query<{ id: string }>(workdir, `select id from public.households where id <> '${HOUSEHOLD}'`).map((row) => row.id);
  expect(others.length).toBeGreaterThanOrEqual(10);
  for (const [path, bytes] of entries) {
    if (path.startsWith('files/') && !/\.(json|csv)$/.test(path)) continue;
    const content = strFromU8(bytes);
    for (const other of others) expect(content.includes(other), `${path} mentions another household`).toBe(false);
  }

  const documents = JSON.parse(text(entries, 'tables/documents.json')) as { id: string; storage_path: string }[];
  const included = documents.filter((document) => entries.has(`files/documents/${document.storage_path}`));
  expect(included.length).toBeGreaterThan(0);
  expect(downloads() - before, 'download rows written by this export').toBe(included.length);

  const sensitive = documents.filter((document) => (document as { sensitivity?: string }).sensitivity === 'sensitive');
  expect(sensitive.length, 'the seed holds sensitive documents').toBeGreaterThan(0);
  for (const document of sensitive) expect(entries.has(`files/documents/${document.storage_path}`), 'a sensitive document is in the ZIP').toBe(true);
});

test('a viewer is refused, and a signed-out call is sent to sign in (FND-2)', async ({ page, browser }) => {
  const admin = `ryan.lane${LANE}@demo.esta.test`;
  await open(page, admin, 'light', DESKTOP);
  const invited = `viewer.export.lane${LANE}@demo.esta.test`;
  const existing = await memberRest<{ id: string }[]>(page, 'GET', `household_members?household_id=eq.${HOUSEHOLD}&invited_email=eq.${invited}&select=id`);
  if (existing.length === 0) await memberRest(page, 'POST', 'household_members', { household_id: HOUSEHOLD, invited_email: invited, role: 'viewer' });
  const viewer = await browser.newPage();
  try {
    await open(viewer, invited, 'light', DESKTOP);
    const response = await viewer.request.post('/api/export');
    expect(response.status()).toBe(403);
    expect(await response.text()).toBe('');
    await viewer.goto('/settings');
    await expect(viewer.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(viewer.getByTestId('settings-data'), 'a viewer sees no download section').toHaveCount(0);
  } finally {
    await viewer.close();
  }
  const anonymous = await browser.newContext();
  try {
    const signedOut = await anonymous.request.post(`${test.info().project.use.baseURL}/api/export`, { maxRedirects: 0 });
    expect(signedOut.status()).toBe(307);
    expect(signedOut.headers().location).toContain('/sign-in');
  } finally {
    await anonymous.close();
  }
});

test('archived rows are exported with their deleted_at, so a restore does not bring them back to life', async ({ page }) => {
  await openNewHousehold(page, 'light', DESKTOP);
  const [member] = await memberRest<{ household_id: string }[]>(page, 'GET', 'household_members?select=household_id');
  const household = member?.household_id ?? '';
  const [kept, archived] = await memberRest<{ id: string }[]>(page, 'POST', 'properties', [
    { household_id: household, nickname: 'Nhà Demo giữ', code: 'KEEP1', kind: 'townhouse', use_mode: 'held' },
    { household_id: household, nickname: 'Nhà Demo lưu trữ', code: 'GONE1', kind: 'townhouse', use_mode: 'held' },
  ]);
  await memberRest(page, 'PATCH', `properties?id=eq.${archived?.id}`, { deleted_at: '2026-10-07T02:00:00Z' });

  const { entries, manifest } = await exportAll(page);
  const properties = JSON.parse(text(entries, 'tables/properties.json')) as { id: string; deleted_at: string | null }[];
  expect(properties.map((row) => row.id).sort()).toEqual([kept?.id, archived?.id].sort());
  expect(properties.find((row) => row.id === archived?.id)?.deleted_at).toBe('2026-10-07T02:00:00+00:00');
  expect(manifest.tables.properties).toBe(2);
  const members = JSON.parse(text(entries, 'tables/household_members.json')) as { invited_email: string | null }[];
  expect(members.length).toBeGreaterThan(0);
  expect(members.every((row) => typeof row.invited_email === 'string' && row.invited_email.length > 0), 'every member can reclaim a row by email').toBe(true);
  expect(text(entries, 'tables/audit_log.json')).toContain(archived?.id ?? 'missing');
});

test('an admin who is not the operator exports every household-wide table in full, and is short only where the registry says the policy narrows', async ({ page }) => {
  await open(page, `me.lane${LANE}@demo.esta.test`, 'light', DESKTOP);
  const counts = await liveCounts(page);
  const { entries, manifest } = await exportAll(page);
  for (const table of EXPORT_TABLES) {
    const live = counts.get(table.name) ?? 0;
    const exported = (JSON.parse(text(entries, `tables/${table.name}.json`)) as unknown[]).length;
    expect(manifest.tables[table.name]).toBe(exported);
    expect(exported, `${table.name} never exports more than the database holds`).toBeLessThanOrEqual(live);
    if (table.visibility === 'household') expect(exported, `${table.name} is household-wide, so nothing is short`).toBe(live);
  }
});

const SEEN = { chat: 'Cuộc trò chuyện Demo riêng của Mẹ', item: 'Ghi chú Demo chỉ người vận hành' };

type Ids = { chat: string; item: string };

/** Adds, as the service role, a conversation Mẹ started and an assistant item for the operator only, then removes both. */
async function withPrivateRows(page: Page, run: (ids: Ids) => Promise<void>): Promise<void> {
  const headers = { ...service, 'content-type': 'application/json', prefer: 'return=representation' };
  const post = async (table: string, data: object) => {
    const response = await page.request.post(`${rest}/${table}`, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { id: string }[])[0]?.id ?? '';
  };
  const chat = await post('conversations', { household_id: HOUSEHOLD, title: SEEN.chat, last_asked_at: '2026-10-07T02:00:00Z' });
  const item = await post('agent_items', { household_id: HOUSEHOLD, kind: 'system', severity: 'info', title: SEEN.item, body_md: 'Chỉ Ryan đọc', audience: 'operator', dedupe_key: `export-spec-${chat}` });
  try {
    runSql(localTarget().dbUrl, `do $x$ begin set local session_replication_role = replica; update public.conversations set created_by = (select user_id from public.household_members where household_id = '${HOUSEHOLD}' and invited_email = 'me.lane${LANE}@demo.esta.test') where id = '${chat}'; end $x$;`);
    await run({ chat, item });
  } finally {
    await page.request.delete(`${rest}/agent_items?id=eq.${item}`, { headers });
    await page.request.delete(`${rest}/conversations?id=eq.${chat}`, { headers });
  }
}

const rowIds = (entries: Map<string, Uint8Array>, table: string) => (JSON.parse(text(entries, `tables/${table}.json`)) as { id: string }[]).map((row) => row.id);

test('a partial export says so: each manifest and each screen names what that admin cannot read', async ({ page, browser }) => {
  await open(page, `ryan.lane${LANE}@demo.esta.test`, 'light', DESKTOP);
  await withPrivateRows(page, async (ids) => {
    const ryan = await exportAll(page);
    expect(ryan.manifest).toMatchObject({ exporter: { role: 'admin', isOperator: true }, complete: false });
    expect(ryan.manifest.withheld.map((entry) => entry.table)).toEqual(['audit_log', 'conversations', 'notifications', 'messages']);
    expect(rowIds(ryan.entries, 'agent_items'), 'the operator reads the operator-only item').toContain(ids.item);
    expect(rowIds(ryan.entries, 'conversations'), "Ryan's file lacks Mẹ's chat").not.toContain(ids.chat);
    await page.goto('/settings');
    const ryanScreen = page.getByTestId('export-withheld');
    await expect(ryanScreen).toContainText('các cuộc trò chuyện với Trợ lý của người khác');
    await expect(ryanScreen).not.toContainText('người vận hành');
    await expect(ryanScreen).not.toContainText('sao lưu');
    const backup = page.getByTestId('export-backup');
    await expect(backup).toContainText('Mỗi đêm Esta tự lưu một bản đầy đủ');
    await expect(backup).not.toContainText(/sắp có|dữ liệu|hệ thống|bản cập nhật/i);

    const mother = await browser.newPage();
    try {
      await open(mother, `me.lane${LANE}@demo.esta.test`, 'light', DESKTOP);
      const me = await exportAll(mother);
      expect(me.manifest).toMatchObject({ exporter: { role: 'admin', isOperator: false }, complete: false });
      expect(me.manifest.withheld.map((entry) => entry.table)).toEqual(['agent_jobs', 'agent_items', 'agent_runs', 'audit_log', 'conversations', 'notifications', 'messages']);
      expect(rowIds(me.entries, 'agent_items'), "Mẹ's file lacks the operator-only item").not.toContain(ids.item);
      expect(rowIds(me.entries, 'conversations'), 'Mẹ reads her own chat').toContain(ids.chat);
      await mother.goto('/settings');
      const motherScreen = mother.getByTestId('export-withheld');
      await expect(motherScreen).toContainText('ghi chú kỹ thuật và công việc nền của Trợ lý');
      await expect(motherScreen).toContainText('các cuộc trò chuyện với Trợ lý của người khác');
      await expect(motherScreen).not.toContainText(/sắp có|dữ liệu|hệ thống|người vận hành/i);
    } finally {
      await mother.close();
    }
  });
});

test('Mẹ taps Tải toàn bộ thông tin and gets one link per part, each a ZIP', async ({ page }) => {
  const phone = test.info().project.name === 'mobile';
  const viewport = phone ? PHONE : DESKTOP;
  await open(page, 'me.lane8@demo.esta.test', phone ? 'light' : 'dark', viewport);
  await page.route('**/api/export', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto('/settings');
  const section = page.getByTestId('settings-data');
  await expect(section.getByRole('heading', { name: 'Tải thông tin về' })).toBeVisible();
  await expect(section).toContainText('Tệp gồm cả giấy tờ nhạy cảm');
  expect(await seriousAxeViolations(page)).toEqual([]);

  await section.getByTestId('export-start').click();
  await expect(section.getByTestId('export-start')).toBeDisabled();
  await expect(section.getByTestId('export-status')).toHaveText('Đang chuẩn bị tệp...');
  await section.scrollIntoViewIfNeeded();
  await shot(page, `p6-02a-preparing-${phone ? '390-light' : '1440-dark'}`);
  const links = section.getByTestId('export-link');
  await expect(links.first()).toBeVisible({ timeout: 30_000 });
  await expect(section.getByTestId('export-status')).toHaveText('');
  const count = await links.count();
  expect(count).toBeGreaterThan(1);
  await expect(section).toContainText(`chia thành ${count} tệp`);
  await expect(links.first()).toHaveText(`Tải tệp ZIP phần 1/${count} (hết hạn sau 5 phút)`);
  await expect(links.last()).toHaveText(`Tải tệp ZIP phần ${count}/${count} (hết hạn sau 5 phút)`);
  for (let index = 0; index < count; index += 1) {
    const box = await links.nth(index).boundingBox();
    expect(box?.height ?? 0, 'a 44 px target').toBeGreaterThanOrEqual(44);
    expect((box?.x ?? -1) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
    const download = await page.request.get((await links.nth(index).getAttribute('href')) ?? '');
    expect(download.status()).toBe(200);
    expect(Object.keys(unzipSync(new Uint8Array(await download.body()))).length).toBeGreaterThan(0);
  }
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, `p6-02a-ready-${phone ? '390-light' : '1440-dark'}`);
});
