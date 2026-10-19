import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { signIn } from './helpers/inbucket';
import { accessToken } from './helpers/session';

const env = slotEnv(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const NBSP = String.fromCharCode(160);
const propertyId = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);
const householdId = (lane: number) => seedId(`seed:household:lane-${lane}`);
const seedLease = (lane: number, key: string, unit: number) => seedId(`seed:lease:lane-${lane}:${key}:${unit}`);
const leasePath = (lane: number, key: string, lease: string) => `/properties/${propertyId(lane, key)}/rental/leases/${lease}`;

// `ESTA_E2E_VIDEO=1` records each rule at its own size, for the PR's review video.
const recording = process.env.ESTA_E2E_VIDEO === '1';
test.use(recording ? { video: { mode: 'on', size: PHONE }, launchOptions: { slowMo: 900 } } : { video: 'off' });

// Marks and amendable starts count from the Clock, so the spec runs in the `clock` project on SPEC §9.3's day. Each rule
// uses its own lane household, and the rules that change a lease make a fresh one, so the spec passes again without a reset.
test.beforeAll(async ({ request }) => {
  const headers = { authorization: `Bearer ${slotEnv(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT), { withKeys: false }).CRON_SECRET}` };
  const response = await request.post('/api/test/clock', { headers, data: { frozen_now: '2026-10-07T09:00:00+07:00' } });
  expect(response.ok()).toBe(true);
});

async function open(page: Page, email: string, theme: 'light' | 'dark', viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
}

async function call(page: Page, method: 'GET' | 'POST' | 'PATCH', path: string, data?: Record<string, unknown>) {
  return page.request.fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: { apikey: anonKey, authorization: `Bearer ${await accessToken(page)}`, 'content-type': 'application/json', prefer: 'return=representation' },
    ...(data === undefined ? {} : { data }),
  });
}

async function rest<T>(page: Page, method: 'GET' | 'POST' | 'PATCH', path: string, data?: Record<string, unknown>): Promise<T> {
  const response = await call(page, method, path, data);
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** An enabled button fades its colors in; axe reads it once the fade has finished. */
async function settled(button: Locator) {
  await expect(button).toBeEnabled();
  await button.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
}

const holdForRecording = (page: Page) => (recording ? page.waitForTimeout(2500) : Promise.resolve());
const toast = (page: Page) => page.getByRole('region', { name: /Thông báo|Notifications/ });
const noSideScroll = (page: Page) => page.locator('html').evaluate((html) => html.scrollWidth <= html.clientWidth);
const period = (page: Page, start: string) => page.getByTestId('lease-timeline').locator(`li[data-period-start="${start}"]`);

/** Every issued invoice of the lease with its lines, to prove a change leaves them as they were (LSE-2). */
const issued = (page: Page, lease: string) => rest<unknown[]>(page, 'GET', `invoices?lease_id=eq.${lease}&status=eq.issued&select=*,invoice_lines(*)&order=period_start`);

type FreshTerms = { start: string; end: string; rent: number; paidThrough: string };

/**
 * An active monthly lease on a room no lease has touched, named as `Thêm phòng` would name it, for the Phòng 7 tenant.
 * It is drafted and activated through the session like any member's lease, so its invoices are what activation issues.
 */
async function freshLease(page: Page, lane: number, terms: FreshTerms): Promise<{ id: string; label: string; path: string }> {
  const property = propertyId(lane, 'di-an');
  const units = await rest<{ label: string }[]>(page, 'GET', `units?property_id=eq.${property}&select=label`);
  const label = `Phòng ${Math.max(...units.map((unit) => Number(/^Phòng (\d+)$/.exec(unit.label)?.[1] ?? 0))) + 1}`;
  const [unit] = await rest<{ id: string }[]>(page, 'POST', 'units', { household_id: householdId(lane), property_id: property, label, kind: 'room', list_rent_vnd: terms.rent });
  const [lease] = await rest<{ id: string }[]>(page, 'POST', 'leases', {
    household_id: householdId(lane),
    property_id: property,
    unit_id: unit?.id,
    tenant_party_id: seedId(`seed:party:tenant-lane-${lane}:di-an:7`),
    start_date: terms.start,
    end_date: terms.end,
    rent_vnd: terms.rent,
    deposit_vnd: terms.rent,
  });
  const id = lease?.id ?? '';
  await rest(page, 'POST', 'rpc/activate_lease', { p_lease_id: id, p_paid_through: terms.paidThrough });
  return { id, label, path: leasePath(lane, 'di-an', id) };
}

test('rule 1: Phòng 5 shows September 12 days overdue, October not yet due and earlier periods collected, at 390 and 1440', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  await page.goto(leasePath(2, 'di-an', seedLease(2, 'di-an', 5)));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hợp đồng Phòng 5');
  await expect(page.getByTestId('lease-status')).toHaveText('Đang thuê');
  await expect(period(page, '2026-09-25').locator('[data-status="overdue"]')).toHaveText('Quá hạn 12 ngày');
  await expect(period(page, '2026-10-25')).toContainText('Hạn thu 25/10/2026');
  await expect(period(page, '2026-10-25').locator('[data-status="upcoming"]')).toHaveText('Chưa đến hạn');
  await page.getByTestId('timeline-earlier').locator('summary').click();
  await expect(period(page, '2026-08-25').locator('[data-status="paid"]')).toHaveText('Đã thu');
  await expect(page.getByTestId('lease-deposit').locator('dd')).toHaveText(`2.800.000${NBSP}₫`);
  await expect(page.getByTestId('lease-tax')).toContainText('Chủ nhà tự nộp');
  await expect(page.getByTestId('lease-actions').getByRole('button')).toHaveText(['Gia hạn', 'Đổi tiền thuê', 'Kết thúc hợp đồng']);
  await expect(page.getByTestId('skeleton-lease')).toHaveCount(0);
  expect(await noSideScroll(page)).toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('phong5-390-light.png'), fullPage: true });

  await page.setViewportSize(DESKTOP);
  await expect(period(page, '2026-09-25').locator('[data-status="overdue"]')).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('phong5-1440-light.png'), fullPage: true });
});

test('rule 2: amending Phòng 2 offers only starts after 07/10/2026, bills the new rent from that period, and leaves every issued invoice as it was', async ({ page }) => {
  await open(page, 'ryan.lane5@demo.esta.test', 'light', DESKTOP);
  const lease = seedLease(5, 'di-an', 2);
  const before = await issued(page, lease);
  await page.goto(leasePath(5, 'di-an', lease));
  await page.getByTestId('lease-amend').click();
  const sheet = page.getByTestId('amend-sheet');
  await expect(sheet.getByTestId('amend-start')).toBeVisible();
  const starts = await sheet.getByTestId('amend-start').locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(starts.length).toBeGreaterThan(0);
  expect(starts.every((start) => start > '2026-11-24'), `${starts.join(', ')} start after the issued 25/10 period`).toBe(true);
  const [first] = starts;
  if (first === undefined) throw new Error('no amendable start');
  await sheet.getByRole('textbox', { name: 'Tiền thuê mới mỗi tháng' }).fill('2700000');
  await sheet.getByTestId('amend-reason').fill('Phụ lục Demo tăng giá');
  await settled(sheet.getByTestId('amend-save'));
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('amend-sheet-1440-light.png') });
  await sheet.getByTestId('amend-save').click();

  const [year, month, day] = first.split('-');
  await expect(toast(page)).toContainText(`Đã đổi tiền thuê từ ${day}/${month}/${year}.`);
  await expect(period(page, first).getByTestId('period-new-rent')).toHaveText('Giá mới từ kỳ này');
  await expect(period(page, first).locator('data')).toHaveText(`2.700.000${NBSP}₫`);
  await expect(page.getByTestId('lease-amendments')).toContainText(`Từ ${day}/${month}/${year}: 2.700.000${NBSP}₫ mỗi tháng`);
  expect(await issued(page, lease)).toEqual(before);
  await holdForRecording(page);
  await page.screenshot({ path: test.info().outputPath('amended-1440-light.png'), fullPage: true });
});

test('rule 3: terminating from 31/10/2026 asks the exact question, keeps the issued October invoice, drops the November draft, and a direct status write is refused', async ({ page }) => {
  await open(page, 'me.lane4@demo.esta.test', 'dark', PHONE);
  const lease = await freshLease(page, 4, { start: '2026-08-01', end: '2027-07-31', rent: 3_000_000, paidThrough: '2026-09-30' });
  const before = await issued(page, lease.id);
  expect(await rest(page, 'GET', `invoices?lease_id=eq.${lease.id}&select=period_start,status&order=period_start`)).toEqual([
    { period_start: '2026-10-01', status: 'issued' },
    { period_start: '2026-11-01', status: 'draft' },
  ]);

  const refused = await call(page, 'PATCH', `leases?id=eq.${lease.id}`, { status: 'ended' });
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toMatchObject({ code: '42501' });
  const locked = await call(page, 'PATCH', `leases?id=eq.${lease.id}`, { end_date: '2026-10-31' });
  expect(await locked.json()).toMatchObject({ message: 'ESTA_LEASE_TERMS_LOCKED' });

  await page.goto(lease.path);
  await page.getByTestId('lease-terminate').click();
  const dialog = page.getByTestId('terminate-dialog');
  await dialog.getByRole('textbox', { name: 'Ngày kết thúc' }).fill('31/10/2026');
  await expect(dialog.getByTestId('terminate-question')).toHaveText(`Kết thúc hợp đồng ${lease.label} từ ngày 31/10/2026?`);
  await dialog.getByTestId('terminate-confirm').click();
  await expect(dialog.getByTestId('lease-change-refusal')).toHaveText('Nhập lý do kết thúc.');
  await dialog.getByTestId('terminate-reason').fill('Người thuê chuyển đi');
  await settled(dialog.getByTestId('terminate-confirm'));
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('terminate-390-dark.png') });
  await dialog.getByTestId('terminate-confirm').click();

  await expect(toast(page)).toContainText(`Đã kết thúc hợp đồng ${lease.label} từ ngày 31/10/2026.`);
  await expect(page.getByTestId('lease-status')).toHaveText('Đã chấm dứt');
  await expect(page.getByTestId('lease-termination')).toContainText('Từ ngày 31/10/2026. Lý do: Người thuê chuyển đi');
  await expect(page.getByTestId('lease-terminate')).toHaveCount(0);
  await expect(page.getByTestId('lease-amend')).toHaveCount(0);
  await expect(page.getByTestId('lease-timeline').locator('li')).toHaveCount(3);
  await expect(period(page, '2026-11-01')).toHaveCount(0);
  expect(await issued(page, lease.id)).toEqual(before);
  expect(await rest(page, 'GET', `invoices?lease_id=eq.${lease.id}&period_start=gt.2026-10-31&select=id`)).toEqual([]);
  expect(await rest(page, 'GET', `leases?id=eq.${lease.id}&select=status,end_date,terminated_on`)).toEqual([
    { status: 'terminated', end_date: '2026-10-31', terminated_on: '2026-10-31' },
  ]);
  expect(await noSideScroll(page)).toBe(true);
  await holdForRecording(page);
  await page.screenshot({ path: test.info().outputPath('terminated-390-dark.png'), fullPage: true });
});

test('rule 4: renewing by 5% previews 9.500.000 ₫ and opens the new lease from 02/11/2026, linked to the old one (SPEC §9.4 seed 7)', async ({ page }) => {
  await open(page, 'ryan.lane3@demo.esta.test', 'dark', DESKTOP);
  const lease = await freshLease(page, 3, { start: '2025-11-01', end: '2026-11-01', rent: 9_000_000, paidThrough: '2026-09-30' });
  await page.goto(lease.path);
  await page.getByTestId('lease-renew').click();
  const sheet = page.getByTestId('renew-sheet');
  await expect(sheet).toContainText('Hợp đồng mới bắt đầu ngày 02/11/2026');
  await sheet.getByTestId('renew-increase').fill('5');
  await expect(sheet.getByTestId('renew-preview').locator('data')).toHaveText(`9.500.000${NBSP}₫`);
  await expect(sheet.getByTestId('renew-preview')).toContainText(`Đang là 9.000.000${NBSP}₫`);
  await settled(sheet.getByTestId('renew-save'));
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('renew-sheet-1440-dark.png') });
  await sheet.getByTestId('renew-save').click();

  await expect(toast(page)).toContainText('Đã gia hạn. Hợp đồng mới từ 02/11/2026.');
  await expect(page).not.toHaveURL(new RegExp(`${lease.id}$`));
  const renewal = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  await expect(page.getByTestId('lease-status')).toHaveText('Đang thuê');
  await expect(page.getByTestId('lease-rent')).toContainText(`9.500.000${NBSP}₫`);
  await expect(page.getByTestId('lease-period')).toContainText('02/11/2026');
  await expect(page.getByTestId('lease-renewal-of')).toHaveAttribute('href', lease.path);
  expect(await rest(page, 'GET', `leases?id=eq.${renewal}&select=start_date,end_date,rent_vnd,status,renewal_of_lease_id`)).toEqual([
    { start_date: '2026-11-02', end_date: '2027-11-01', rent_vnd: 9_500_000, status: 'active', renewal_of_lease_id: lease.id },
  ]);
  await holdForRecording(page);
  await page.screenshot({ path: test.info().outputPath('renewed-1440-dark.png'), fullPage: true });

  await page.goto(lease.path);
  await expect(page.getByTestId('lease-renewed-by')).toHaveText('Hợp đồng mới từ 02/11/2026');
  await expect(page.getByTestId('lease-renew')).toHaveCount(0);
});

test('rule 5: the ended Phòng 7 lease offers no amend or terminate and shows its deposit from the terms', async ({ page }) => {
  await open(page, 'ryan.lane7@demo.esta.test', 'dark', DESKTOP);
  await page.goto(leasePath(7, 'di-an', seedLease(7, 'di-an', 7)));
  await expect(page.getByTestId('lease-status')).toHaveText('Đã kết thúc');
  await expect(page.getByTestId('lease-deposit').locator('dd')).toHaveText(`2.800.000${NBSP}₫`);
  await expect(page.getByTestId('lease-terminate')).toHaveCount(0);
  await expect(page.getByTestId('lease-amend')).toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('phong7-1440-dark.png'), fullPage: true });
});

test('rule 6: q7 shows Bên thuê nộp thay, the rent collected before Esta, the collected quarters, and its 2027 rent change', async ({ page }) => {
  await open(page, 'me.lane8@demo.esta.test', 'dark', PHONE);
  await page.goto(leasePath(8, 'q7', seedLease(8, 'q7', 1)));
  await expect(page.getByTestId('lease-tax')).toContainText('Bên thuê nộp thay');
  await page.getByTestId('timeline-earlier').locator('summary').click();
  await expect(period(page, '2025-07-01')).toHaveAttribute('data-mark', 'prepaid');
  await expect(period(page, '2025-07-01').locator('[data-status="prepaid"]')).toHaveText('Đã thu trước');
  for (const start of ['2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01']) {
    await expect(period(page, start), start).toHaveAttribute('data-mark', 'paid');
  }
  await expect(period(page, '2027-01-01').getByTestId('period-new-rent')).toBeVisible();
  await expect(page.getByTestId('lease-amendments')).toContainText(`Từ 01/01/2027: 16.000.000${NBSP}₫ mỗi tháng`);
  expect(await noSideScroll(page)).toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('q7-390-dark.png'), fullPage: true });
});

test('rule 7: a lease with no papers offers one Tải hợp đồng lên action, and Thủ Đức lists its contract plainly', async ({ page }) => {
  await open(page, 'ryan.lane9@demo.esta.test', 'light', DESKTOP);
  await page.goto(leasePath(9, 'di-an', seedLease(9, 'di-an', 5)));
  const documents = page.getByTestId('lease-documents');
  await expect(documents.getByText('Chưa có giấy tờ')).toBeVisible();
  await expect(documents.getByRole('button')).toHaveText(['Tải hợp đồng lên']);
  await page.screenshot({ path: test.info().outputPath('docs-empty-1440-light.png'), fullPage: true });

  await page.goto(leasePath(9, 'thu-duc', seedLease(9, 'thu-duc', 1)));
  const contract = page.getByTestId('lease-document');
  await expect(contract).toHaveCount(1);
  await expect(contract.getByRole('link')).toContainText('Hợp đồng thuê Căn hộ Thủ Đức');
  await expect(contract.getByRole('link')).toHaveAttribute('href', `/documents/${seedId('seed:document:lane-9:thu-duc:lease')}`);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 8: in English at 130% text, Phòng 5 reads 12 days overdue and every timeline row wraps without clipping', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  const memberId = seedId('seed:member:me-lane-10');
  await rest(page, 'PATCH', `household_members?id=eq.${memberId}`, { locale: 'en', text_scale: 130 });
  try {
    await page.goto(leasePath(10, 'di-an', seedLease(10, 'di-an', 5)));
    await expect(period(page, '2026-09-25').locator('[data-status="overdue"]')).toHaveText('12 days overdue');
    await expect(page.getByTestId('skeleton-lease')).toHaveCount(0);
    const clipped = await page
      .getByTestId('lease-timeline')
      .locator('li')
      .evaluateAll((rows) => rows.filter((row) => row.scrollWidth > row.clientWidth).map((row) => row.getAttribute('data-period-start')));
    expect(clipped).toEqual([]);
    expect(await noSideScroll(page)).toBe(true);
    expect(await seriousAxeViolations(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('phong5-en-130-390-dark.png'), fullPage: true });
  } finally {
    await rest(page, 'PATCH', `household_members?id=eq.${memberId}`, { locale: 'vi', text_scale: 100 });
  }
});
