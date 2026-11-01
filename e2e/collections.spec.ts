import { expect, test, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { signIn } from './helpers/inbucket';
import { accessToken } from './helpers/session';
import { setClock } from './helpers/test-clock';
import { seriousAxeViolations } from './helpers/wizard';

const env = slotEnv(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const NBSP = ' ';
const SPEC_TODAY = '2026-10-07T09:00:00+07:00';
const DI_AN_ROOMS = [1, 2, 3, 4, 5, 6].map((n) => `Phòng ${n}, Dãy trọ Dĩ An`);
const householdId = (lane: number) => seedId(`seed:household:lane-${lane}`);

// `ESTA_E2E_VIDEO=1` records each rule at the phone size, for the PR's video of the main flow.
const recording = process.env.ESTA_E2E_VIDEO === '1';
test.use(recording ? { video: { mode: 'on', size: PHONE }, launchOptions: { slowMo: 1200 } } : { video: 'off' });
const holdForRecording = (page: Page) => (recording ? page.waitForTimeout(3500) : Promise.resolve());

// Overdue days count from the Clock, so the spec runs in the `clock` project on SPEC §9.3's day; rule 4 moves the clock
// and puts it back. Each rule reads its own lane household.
test.beforeEach(async ({ request }) => {
  await setClock(request, SPEC_TODAY);
});

async function open(page: Page, email: string, theme: 'light' | 'dark', viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
}

async function rest<T>(page: Page, method: 'GET' | 'POST' | 'PATCH', path: string, data?: Record<string, unknown>): Promise<T> {
  const response = await page.request.fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: { apikey: anonKey, authorization: `Bearer ${await accessToken(page)}`, 'content-type': 'application/json', prefer: 'return=representation' },
    ...(data === undefined ? {} : { data }),
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}

const group = (page: Page, key: 'overdue' | 'due' | 'notDue' | 'paid') => page.getByTestId(`group-${key}`);
const rows = (scope: Locator) => scope.getByTestId('collections-row');
const placesIn = (scope: Locator) => rows(scope).getByTestId('row-place').allInnerTexts();
const row = (scope: Locator, place: string) => rows(scope).filter({ has: scope.page().getByTestId('row-place').getByText(place, { exact: true }) });
const tab = (page: Page, key: 'all' | 'overdue' | 'due' | 'notDue' | 'paid') => page.locator(`[data-tab="${key}"]`);
const figure = (page: Page, key: 'paid' | 'owed' | 'overdue') => page.getByTestId(`figure-${key}`).locator('data');
const noSideScroll = (page: Page) => page.locator('html').evaluate((html) => html.scrollWidth <= html.clientWidth);

async function chooseMonth(page: Page, month: string) {
  await page.getByTestId('month-select').selectOption(month);
  await expect(page).toHaveURL(new RegExp(`month=${month}$`));
}

/** SPEC LSE-10 on the full seed at 2026-10-07: Phòng 5 overdue from September, the six rooms due 25/10 not yet due. */
async function expectOctoberBoard(page: Page) {
  await expect(page.getByTestId('collections-board')).toBeVisible();
  expect(await placesIn(group(page, 'overdue'))).toEqual(['Phòng 5, Dãy trọ Dĩ An']);
  const overdue = row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An');
  await expect(overdue.locator('[data-status="overdue"]')).toHaveText('Quá hạn 12 ngày');
  await expect(overdue.getByTestId('carried-from')).toHaveText('từ tháng 9');
  expect(await placesIn(group(page, 'due'))).toEqual([]);
  expect(await placesIn(group(page, 'notDue'))).toEqual(DI_AN_ROOMS);
  for (const due of await rows(group(page, 'notDue')).getByTestId('row-due').allInnerTexts()) expect(due).toContain('25/10/2026');
  expect(await placesIn(group(page, 'paid'))).toEqual(['Căn hộ Thủ Đức', 'Nhà phố Q7']);
}

test('rule 1 and 2: in October Mẹ finds only Phòng 5 overdue, 12 days from September, and six Dĩ An rooms due 25/10', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  await page.getByRole('link', { name: 'Thu tiền', exact: true }).locator('visible=true').first().click();
  await expect(page).toHaveURL(/\/collections$/);
  await expect(page.getByTestId('month-select')).toHaveValue('2026-10');
  await expectOctoberBoard(page);
  await holdForRecording(page);
  await expect(tab(page, 'overdue')).toHaveText('Quá hạn 1');
  await expect(tab(page, 'notDue')).toHaveText('Chưa đến hạn 6');
  await group(page, 'paid').scrollIntoViewIfNeeded();
  await holdForRecording(page);
  await page.getByTestId('month-select').scrollIntoViewIfNeeded();
  expect(await noSideScroll(page)).toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);

  await chooseMonth(page, '2026-09');
  const september = row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An');
  await expect(september.locator('[data-status="overdue"]')).toHaveText('Quá hạn 12 ngày');
  await expect(september.getByTestId('carried-from')).toHaveCount(0);
  await holdForRecording(page);
  expect(errors).toEqual([]);
});

test('the October board reads the same at 1440, in a table whose header names each column', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', DESKTOP);
  await page.goto('/collections');
  await expectOctoberBoard(page);
  await expect(page.getByRole('columnheader')).toHaveText(['Phòng', 'Hạn thu', 'Còn phải thu', 'Đã thu', 'Trạng thái', 'Việc cần làm']);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 3: September shows Phòng 5 overdue without a carry marker and the other five Dĩ An rooms paid', async ({ page }) => {
  await open(page, 'ryan.lane3@demo.esta.test', 'dark', DESKTOP);
  await page.goto('/collections');
  await chooseMonth(page, '2026-09');
  expect(await placesIn(group(page, 'overdue'))).toEqual(['Phòng 5, Dãy trọ Dĩ An']);
  await expect(row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An').getByTestId('carried-from')).toHaveCount(0);
  expect(await placesIn(group(page, 'paid'))).toEqual(['Căn hộ Thủ Đức', ...[1, 2, 3, 4, 6].map((n) => `Phòng ${n}, Dãy trọ Dĩ An`)]);
  await expect(page.getByTestId('month-this')).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 4: on 25/10 the six Dĩ An rooms are due today and Phòng 5 reads 30 days overdue', async ({ page, request }) => {
  await setClock(request, '2026-10-25T09:00:00+07:00');
  try {
    await open(page, 'me.lane4@demo.esta.test', 'dark', PHONE);
    await page.goto('/collections');
    expect(await placesIn(group(page, 'due'))).toEqual(DI_AN_ROOMS);
    await expect(group(page, 'due').locator('[data-status="due"]')).toHaveCount(6);
    await expect(row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An').locator('[data-status="overdue"]')).toHaveText('Quá hạn 30 ngày');
    expect(await placesIn(group(page, 'notDue'))).toEqual([]);
  } finally {
    await setClock(request, SPEC_TODAY);
  }
});

test('rule 5: the tenant who pays in two transfers shows under Đã thu in September with the full rent', async ({ page }) => {
  await open(page, 'ryan.lane5@demo.esta.test', 'light', DESKTOP);
  const [invoice] = await rest<{ id: string; payment_allocations: { payments: { amount_vnd: number; received_on: string } }[] }[]>(
    page,
    'GET',
    `invoices?lease_id=eq.${seedId('seed:lease:lane-5:di-an:2')}&due_date=eq.2026-09-25&select=id,payment_allocations(payments(amount_vnd,received_on))`,
  );
  const transfers = invoice?.payment_allocations.map(({ payments }) => payments).toSorted((a, b) => a.received_on.localeCompare(b.received_on)) ?? [];
  expect(transfers.map(({ amount_vnd }) => amount_vnd)).toEqual([1_500_000, 1_000_000]);
  const later = await rest<unknown[]>(page, 'GET', `payments?household_id=eq.${householdId(5)}&payer_party_id=eq.${seedId('seed:party:tenant-lane-5:di-an:2')}&received_on=gt.${transfers.at(-1)?.received_on ?? ''}&select=id`);
  expect(later, 'September is the month this tenant last paid').toEqual([]);

  await page.goto('/collections?month=2026-09');
  const paid = row(group(page, 'paid'), 'Phòng 2, Dãy trọ Dĩ An');
  await expect(paid.getByTestId('row-tenant')).toHaveText('Trần Thị Bình Demo');
  await expect(paid.locator('[data-status="paid"]')).toHaveText('Đã thu');
  await expect(paid.getByTestId('row-paid').locator('data')).toHaveText(`2.500.000${NBSP}₫`);
});

test('rule 6: Xem hợp đồng on Phòng 5 opens its lease with the September period 12 days overdue', async ({ page }) => {
  await open(page, 'me.lane6@demo.esta.test', 'light', PHONE);
  await page.goto('/collections');
  await row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An').getByTestId('row-action-open-lease').click();
  await expect(page).toHaveURL(new RegExp(`/rental/leases/${seedId('seed:lease:lane-6:di-an:5')}$`));
  const september = page.getByTestId('invoice-row').filter({ hasText: 'Kỳ 25/09/2026 – 24/10/2026' });
  await expect(september.locator('[data-status="overdue"]')).toHaveText('Quá hạn 12 ngày');
  await expect(page.getByTestId('invoice-row').filter({ hasText: 'Kỳ 25/08/2026 – 24/09/2026' }).locator('[data-status="paid"]')).toHaveText('Đã thu');
  await holdForRecording(page);
});

test('rule 7: in compact density the header stays put, amounts sit right in tabular figures, and every status has a shape and a word', async ({ page }) => {
  const member = `household_members?id=eq.${seedId('seed:member:ryan-lane-7')}`;
  await open(page, 'ryan.lane7@demo.esta.test', 'dark', DESKTOP);
  await rest(page, 'PATCH', member, { density: 'compact' });
  try {
    await page.goto('/collections');
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
    await page.getByTestId('group-paid').scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 400);
    const header = page.getByRole('columnheader', { name: 'Còn phải thu' });
    const box = await header.boundingBox();
    expect(box?.y ?? -1, 'the column header is still on screen').toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => window.scrollY), 'the page scrolled').toBeGreaterThan(0);
    for (const amount of await page.getByTestId('collections-row').locator('data').all()) {
      const style = await amount.evaluate((element) => {
        const cell = element.closest('td');
        return { numeric: getComputedStyle(element).fontVariantNumeric, align: cell === null ? '' : getComputedStyle(cell).textAlign };
      });
      expect(style.numeric).toContain('tabular-nums');
      expect(['end', 'right']).toContain(style.align);
    }
    for (const mark of await page.getByTestId('collections-row').locator('[data-status]').all()) {
      await expect(mark.locator('svg[data-shape]')).toHaveCount(1);
      expect((await mark.innerText()).trim()).not.toBe('');
    }
  } finally {
    await rest(page, 'PATCH', member, { density: 'comfortable' });
  }
});

test('rule 8: December 2024 shows one sentence and nothing else', async ({ page }) => {
  await open(page, 'me.lane8@demo.esta.test', 'dark', PHONE);
  await page.goto('/collections');
  await chooseMonth(page, '2024-12');
  await expect(page.getByTestId('collections-empty')).toHaveText('Tháng 12/2024 không có hóa đơn nào.');
  await expect(page.getByTestId('collections-board')).toHaveCount(0);
  await expect(page.locator('[data-tab]')).toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 9: the Chưa đến hạn total equals what the six invoices due 25/10 still owe', async ({ page }) => {
  await open(page, 'ryan.lane9@demo.esta.test', 'light', DESKTOP);
  const balances = await rest<{ outstanding_vnd: number }[]>(page, 'GET', `invoice_balances?household_id=eq.${householdId(9)}&due_date=eq.2026-10-25&status=eq.issued&select=outstanding_vnd`);
  expect(balances).toHaveLength(6);
  const owed = balances.reduce((sum, { outstanding_vnd }) => sum + outstanding_vnd, 0);
  await page.goto('/collections');
  await tab(page, 'notDue').click();
  await expect(page.getByTestId('total-count')).toHaveText('Cộng 6 hóa đơn');
  const total = page.getByTestId('total-owed').locator('data');
  await expect(total).toHaveAttribute('value', String(owed));
  await expect(total).toHaveText(`15.600.000${NBSP}₫`);
});

test('a status tab takes one tap, survives a reload and a month change, and its total row matches the strip', async ({ page }) => {
  await open(page, 'ryan.lane3@demo.esta.test', 'light', PHONE);
  await page.goto('/collections');
  await expect(tab(page, 'all')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('total-count')).toHaveText('Cộng 9 hóa đơn');
  await expect(page.getByTestId('total-owed').locator('data')).toHaveAttribute('value', (await figure(page, 'owed').getAttribute('value')) ?? '');
  await expect(page.getByTestId('total-paid').locator('data')).toHaveAttribute('value', (await figure(page, 'paid').getAttribute('value')) ?? '');

  await tab(page, 'overdue').click();
  await expect(page).toHaveURL(/\/collections\?status=overdue$/);
  await expect(tab(page, 'overdue')).toHaveAttribute('aria-current', 'true');
  expect(await placesIn(page.getByTestId('collections-board'))).toEqual(['Phòng 5, Dãy trọ Dĩ An']);
  await expect(page.getByTestId('total-count')).toHaveText('Cộng 1 hóa đơn');
  await expect(figure(page, 'overdue')).toHaveText(`2.800.000${NBSP}₫`);
  await expect(page.getByTestId('total-owed').locator('data')).toHaveAttribute('value', '2800000');

  await page.reload();
  await expect(tab(page, 'overdue')).toHaveAttribute('aria-current', 'true');
  expect(await placesIn(page.getByTestId('collections-board'))).toEqual(['Phòng 5, Dãy trọ Dĩ An']);

  await page.getByTestId('month-select').selectOption('2026-09');
  await expect(page).toHaveURL(/month=2026-09&status=overdue$/);
  await expect(tab(page, 'overdue')).toHaveAttribute('aria-current', 'true');
  await tab(page, 'due').click();
  await expect(page.getByTestId('collections-filter-empty')).toHaveText(/Hôm nay không có hóa đơn nào đến hạn\.\s*Xem tất cả/);
  await page.getByRole('link', { name: 'Xem tất cả' }).click();
  await expect(page).toHaveURL(/\/collections\?month=2026-09$/);
  expect(await noSideScroll(page)).toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 10: in English at 130% text Phòng 5 sits in Overdue at 12 days and no row text is cut', async ({ page }) => {
  const member = `household_members?id=eq.${seedId('seed:member:ryan-lane-10')}`;
  await open(page, 'ryan.lane10@demo.esta.test', 'dark', PHONE);
  await rest(page, 'PATCH', member, { locale: 'en', text_scale: 130 });
  try {
    await page.goto('/collections');
    await expect(tab(page, 'overdue')).toHaveText('Overdue 1');
    await expect(row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An').locator('[data-status="overdue"]')).toHaveText('12 days overdue');
    await expect(row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An').getByTestId('carried-from')).toHaveText('from September');
    const cut = await page.getByTestId('collections-row').locator('span, data').evaluateAll((elements) =>
      elements.filter((element) => element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflow !== 'visible').map((element) => element.textContent),
    );
    expect(cut).toEqual([]);
    expect(await noSideScroll(page)).toBe(true);
    expect(await seriousAxeViolations(page)).toEqual([]);
  } finally {
    await rest(page, 'PATCH', member, { locale: 'vi', text_scale: 100 });
  }
});

test('a viewer reads the board, opens a lease and shows a bill’s code, with no write action', async ({ page }) => {
  await open(page, 'me.lane7@demo.esta.test', 'light', PHONE);
  const invited = 'viewer.lane7@demo.esta.test';
  const existing = await rest<unknown[]>(page, 'GET', `household_members?invited_email=eq.${invited}&select=id`);
  if (existing.length === 0) await rest(page, 'POST', 'household_members', { household_id: householdId(7), invited_email: invited, role: 'viewer' });
  await page.context().clearCookies();
  await open(page, invited, 'light', PHONE);
  await page.goto('/collections');
  await expectOctoberBoard(page);
  const phong5 = row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An');
  await expect(phong5.locator('a')).toHaveText(['Xem hợp đồng']);
  await expect(phong5.getByRole('button')).toHaveText(['Mã QR']);
});

test('offline, the board says it is the last load', async ({ page }) => {
  await open(page, 'ryan.lane8@demo.esta.test', 'light', PHONE);
  await page.goto('/collections');
  await expect(page.getByTestId('collections-offline')).toHaveCount(0);
  await page.context().setOffline(true);
  await expect(page.getByTestId('collections-offline')).toContainText('Đang mất mạng');
  await page.context().setOffline(false);
  await expect(page.getByTestId('collections-offline')).toHaveCount(0);
});

test('the property cards show each property worst payment state for the month (LSE-10)', async ({ page }) => {
  await open(page, 'ryan.lane6@demo.esta.test', 'light', PHONE);
  await page.goto('/properties');
  const card = (name: string) => page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(card('Dãy trọ Dĩ An').locator('[data-status="overdue"]')).toHaveText('Quá hạn 12 ngày');
  await expect(card('Nhà phố Q7').locator('[data-status="paid"]').first()).toHaveText('Đã thu tháng 10');
  await expect(card('Mặt bằng Quận 1').locator('[data-status="overdue"], [data-status="due"]')).toHaveCount(0);
});

test('archiving Dãy trọ Dĩ An keeps the rent Phòng 5 still owes on the board and its bill page, marked as archived (#134)', async ({ page }) => {
  const diAn = seedId('seed:property:lane-9:di-an');
  await open(page, 'ryan.lane9@demo.esta.test', 'light', PHONE);
  await page.goto(`/properties/${diAn}/edit`);
  await page.getByTestId('archive-property').click();
  await expect(page).toHaveURL(/\/properties$/);
  try {
    await page.goto('/collections');
    await expect(page.getByTestId('collections-board')).toBeVisible();
    const overdue = row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An');
    await expect(overdue.locator('[data-status="overdue"]')).toHaveText('Quá hạn 12 ngày');
    await expect(overdue.getByTestId('row-archived')).toHaveText('Tài sản đã lưu trữ');
    await expect(overdue.getByTestId('row-action-open-lease')).toHaveCount(0);
    await expect(overdue.getByRole('button', { name: 'Ghi nhận' })).toBeVisible();
    expect(await placesIn(group(page, 'paid'))).toEqual(['Căn hộ Thủ Đức', 'Nhà phố Q7']);
    await overdue.getByTestId('row-action-qr').click();
    await page.getByTestId('qr-open-invoice').click();
    await expect(page).toHaveURL(/\/collections\/invoices\//);
    await expect(page.getByTestId('receipt-pdf')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Xem hợp đồng' })).toHaveCount(0);
  } finally {
    await page.goto('/properties/archived');
    await page.getByTestId('archived-row').filter({ hasText: 'Dãy trọ Dĩ An' }).getByTestId('restore-property').click();
    await expect(page.getByTestId('archived-row').filter({ hasText: 'Dãy trọ Dĩ An' })).toHaveCount(0);
  }
});
