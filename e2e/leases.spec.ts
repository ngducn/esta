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
const NBSP = ' ';
const propertyId = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);
const householdId = (lane: number) => seedId(`seed:household:lane-${lane}`);
const unitId = (lane: number, key: string, n: number) => seedId(`seed:unit:lane-${lane}:${key}:${n}`);
const wholeUnitId = (lane: number, key: string) => seedId(`esta:unit:whole:${propertyId(lane, key)}`);
const rentalPath = (lane: number, key: string) => `/properties/${propertyId(lane, key)}/rental`;
const newLeasePath = (lane: number, key: string, unit: string) => `${rentalPath(lane, key)}/leases/new?unit=${unit}`;

// `ESTA_E2E_VIDEO=1` records each rule at the phone size, for the PR's video of the main flow (rule 2).
const recording = process.env.ESTA_E2E_VIDEO === '1';
test.use(recording ? { video: { mode: 'on', size: PHONE }, launchOptions: { slowMo: 900 } } : { video: 'off' });

// Overdue days count from the Clock, so the spec runs in the `clock` project, one file at a time, on SPEC §9.3's day.
// Each rule writes to its own lane household and sets its own viewport.
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

async function rest<T>(page: Page, method: 'GET' | 'POST' | 'PATCH', path: string, data?: Record<string, unknown>): Promise<T> {
  const response = await page.request.fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: { apikey: anonKey, authorization: `Bearer ${await accessToken(page)}`, 'content-type': 'application/json', prefer: 'return=representation' },
    ...(data === undefined ? {} : { data }),
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** Keeps a result on screen long enough to read in the PR video; a normal run does not wait. */
/** The confirm button waits for the preview of the date on screen, then fades its colors in; axe reads it once settled. */
async function previewSettled(dialog: Locator) {
  const confirm = dialog.getByTestId('confirm-activate');
  await expect(confirm).toBeEnabled();
  await confirm.evaluate((button) => Promise.all(button.getAnimations().map((animation) => animation.finished)));
}

const holdForRecording = (page: Page) => (recording ? page.waitForTimeout(2500) : Promise.resolve());

const unitRow = (page: Page, label: string) => page.getByTestId('unit-row').filter({ has: page.getByRole('heading', { name: label, exact: true }) });
const toast = (page: Page) => page.getByRole('region', { name: /Thông báo|Notifications/ });
const noSideScroll = (page: Page) => page.locator('html').evaluate((html) => html.scrollWidth <= html.clientWidth);

/** A room no lease has touched, named as `Thêm phòng` would name it, so the rule passes again without a reset. */
async function freshRoom(page: Page, lane: number): Promise<string> {
  const units = await rest<{ label: string }[]>(page, 'GET', `units?property_id=eq.${propertyId(lane, 'di-an')}&select=label`);
  const next = Math.max(...units.map((unit) => Number(/^Phòng (\d+)$/.exec(unit.label)?.[1] ?? 0))) + 1;
  const label = `Phòng ${next}`;
  await rest(page, 'POST', 'units', { household_id: householdId(lane), property_id: propertyId(lane, 'di-an'), label, kind: 'room', list_rent_vnd: 3_000_000, sort_order: next });
  return label;
}

test('rule 1: Cho thuê on Dĩ An shows tenants on Phòng 1 to 6, Phòng 5 overdue 12 days, and Thêm hợp đồng on Phòng 7 and 8', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  await page.goto(rentalPath(1, 'di-an'));
  const tenants = ['Nguyễn Văn An Demo', 'Trần Thị Bình Demo', 'Lê Văn Cường Demo', 'Võ Thị Dung Demo', 'Hoàng Văn Em Demo', 'Đặng Thị Giang Demo'];
  for (const [index, name] of tenants.entries()) await expect(unitRow(page, `Phòng ${index + 1}`).getByTestId('unit-tenant')).toHaveText(name);
  await expect(unitRow(page, 'Phòng 5').locator('[data-status="overdue"]')).toHaveText('Quá hạn 12 ngày');
  await expect(unitRow(page, 'Phòng 1').getByTestId('unit-lease')).toContainText('Hạn thu 25/10/2026');
  for (const label of ['Phòng 7', 'Phòng 8']) {
    await expect(unitRow(page, label).getByTestId('add-lease')).toHaveText('Thêm hợp đồng');
    await expect(unitRow(page, label).locator('[data-status="vacant"]')).toHaveText('Phòng trống');
  }
  await expect(page.getByTestId('add-lease')).toHaveCount(2);
  await expect(page.locator('[data-status="paid"]').filter({ hasText: 'Đang cho thuê 6/8' })).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('Đã thu đến reads the end of the paid periods: Q7 31/12/2026, Thủ Đức 31/10/2026, Phòng 1 to 3 24/10/2026 and Phòng 5 24/09/2026 (SPEC §9.3)', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  const expected = [
    ['q7', 1, '31/12/2026'],
    ['thu-duc', 1, '31/10/2026'],
    ['di-an', 1, '24/10/2026'],
    ['di-an', 2, '24/10/2026'],
    ['di-an', 3, '24/10/2026'],
    ['di-an', 5, '24/09/2026'],
  ] as const;
  for (const [property, unit, date] of expected) {
    await page.goto(`${rentalPath(1, property)}/leases/${seedId(`seed:lease:lane-1:${property}:${unit}`)}`);
    await expect(page.getByTestId('lease-paid-through'), `${property} ${unit}`).toHaveText(date);
  }
});

test('rule 7: the properties list shows the rent of active leases, Đang cho thuê 6/8 on Dĩ An, and no rent on Biên Hòa', async ({ page }) => {
  await open(page, 'ryan.lane7@demo.esta.test', 'dark', DESKTOP);
  await page.goto('/properties');
  const card = (name: string) => page.getByTestId('property-card').filter({ has: page.getByRole('link', { name, exact: true }) });
  await expect(card('Dãy trọ Dĩ An').getByTestId('property-rent')).toHaveText(/^Tiền thuê mỗi tháng\s*15,6\str$/);
  await expect(card('Dãy trọ Dĩ An').locator('[data-status="paid"]')).toHaveText('Đang cho thuê 6/8');
  await expect(card('Dãy trọ Dĩ An').locator('[data-status="vacant"]')).toHaveText('Trống từ 01/08');
  await expect(card('Kho Biên Hòa').getByTestId('property-rent')).toHaveCount(0);
  await expect(card('Kho Biên Hòa').locator('[data-status="vacant"]')).toHaveText('Trống từ 30/07');
  for (const name of ['Nhà phố Q7', 'Căn hộ Thủ Đức', 'Mặt bằng Quận 1']) await expect(card(name).getByTestId('property-rent')).toBeVisible();
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 2: Mẹ adds a tenant by name and phone, activates a monthly lease paid through 30/09/2026 and sees October issued, due 01/10/2026 (LSE-1, LSE-3)', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'light', PHONE);
  const room = await freshRoom(page, 3);
  await page.goto(rentalPath(3, 'di-an'));
  await unitRow(page, room).getByTestId('add-lease').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Hợp đồng mới cho ${room}`);
  await expect(page.getByTestId('form-loading')).toHaveCount(0);

  await page.getByTestId('add-tenant').click();
  await page.locator('#tenant-name').fill('Lê Văn Demo');
  await page.locator('#tenant-phone').fill('0903 123 456');
  await page.getByTestId('save-tenant').click();
  await expect(page.getByTestId('lease-tenant').locator('option:checked')).toHaveText('Lê Văn Demo · 0903 123 456');
  await page.getByRole('textbox', { name: 'Ngày bắt đầu' }).fill('01/08/2026');
  expect(await seriousAxeViolations(page)).toEqual([]);

  await page.getByTestId('activate-lease').click();
  const dialog = page.getByTestId('activate-dialog');
  await expect(dialog).toBeVisible();
  const paidThrough = dialog.getByRole('textbox', { name: 'Đã thu tiền đến hết ngày' });
  await paidThrough.fill('31/09/2026');
  await paidThrough.blur();
  await expect(dialog.getByTestId('confirm-activate')).toBeDisabled();
  await expect(dialog.getByTestId('preview-bill')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('activate-invalid-date-390-light.png') });
  expect(await rest(page, 'GET', `invoices?lease_id=eq.${new URL(page.url()).pathname.split('/').at(-1) ?? ''}&select=id`)).toEqual([]);
  await paidThrough.fill('30/09/2026');
  await previewSettled(dialog);
  await expect(dialog.getByTestId('preview-bill').first()).toContainText(`Kỳ 01/10/2026 – 31/10/2026Phát hành ngay · hạn thu 01/10/2026${'3.000.000'}${NBSP}₫`);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('activate-preview-390-light.png') });
  await dialog.getByTestId('confirm-activate').click();

  await expect(toast(page)).toContainText('Đã kích hoạt hợp đồng. Hóa đơn tháng 10 đã phát hành.');
  await expect(page.getByTestId('lease-status')).toHaveText('Đang thuê');
  const october = page.getByTestId('invoice-row').filter({ hasText: 'Kỳ 01/10/2026 – 31/10/2026' });
  await expect(october).toContainText('Hạn thu 01/10/2026');
  await expect(october.locator('[data-status="overdue"]')).toHaveText('Quá hạn 6 ngày');
  await expect(october.locator('data')).toHaveText(`3.000.000${NBSP}₫`);
  await expect(page.getByTestId('invoice-row').filter({ hasText: 'Kỳ 01/11/2026 – 30/11/2026' }).locator('[data-status="draft"]')).toBeVisible();
  await holdForRecording(page);

  const leaseId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  const invoices = await rest<{ period_start: string; due_date: string; status: string; invoice_lines: { kind: string; amount_vnd: number }[] }[]>(
    page,
    'GET',
    `invoices?lease_id=eq.${leaseId}&status=eq.issued&select=period_start,due_date,status,invoice_lines(kind,amount_vnd)`,
  );
  expect(invoices).toEqual([{ period_start: '2026-10-01', due_date: '2026-10-01', status: 'issued', invoice_lines: [{ kind: 'rent', amount_vnd: 3_000_000 }] }]);
  const [lease] = await rest<{ tenant_party_id: string }[]>(page, 'GET', `leases?id=eq.${leaseId}&select=tenant_party_id`);
  expect(await rest(page, 'GET', `parties?id=eq.${lease?.tenant_party_id}&select=phone,tags`)).toEqual([{ phone: '+84903123456', tags: ['tenant'] }]);

  await page.goto(rentalPath(3, 'di-an'));
  await expect(unitRow(page, room).getByTestId('unit-tenant')).toHaveText('Lê Văn Demo');
  await expect(unitRow(page, room).locator('[data-status="overdue"]')).toHaveText('Quá hạn 6 ngày');
  await holdForRecording(page);
});

test('lane 3: a quarterly lease paid through 30/09 bills only October, says so before Mẹ confirms, and a second tab is told it is already active', async ({ page, context }) => {
  await open(page, 'ryan.lane3@demo.esta.test', 'dark', DESKTOP);
  const room = await freshRoom(page, 3);
  const [unit] = await rest<{ id: string }[]>(page, 'GET', `units?property_id=eq.${propertyId(3, 'di-an')}&label=eq.${encodeURIComponent(room)}&select=id`);
  const [tenant] = await rest<{ id: string }[]>(page, 'POST', 'parties', { household_id: householdId(3), kind: 'organization', full_name: 'Công ty Demo Quý', tags: ['tenant'] });
  const [lease] = await rest<{ id: string }[]>(page, 'POST', 'leases', {
    household_id: householdId(3),
    property_id: propertyId(3, 'di-an'),
    unit_id: unit?.id,
    tenant_party_id: tenant?.id,
    start_date: '2026-08-01',
    rent_vnd: 10_000_000,
    billing_cycle_months: 3,
  });
  const activatePath = `${rentalPath(3, 'di-an')}/leases/${lease?.id ?? ''}?activate=1`;
  const other = await context.newPage();
  await other.setViewportSize(DESKTOP);
  await other.goto(activatePath);
  await expect(other.getByTestId('preview-bill')).toHaveCount(2);

  await page.goto(activatePath);
  const dialog = page.getByTestId('activate-dialog');
  await dialog.getByRole('textbox', { name: 'Đã thu tiền đến hết ngày' }).fill('30/09/2026');
  const bills = dialog.getByTestId('preview-bill');
  await expect(bills).toHaveText([
    `Kỳ 01/10/2026 – 31/10/2026Phát hành ngay · hạn thu 01/10/2026${'10.108.696'}${NBSP}₫`,
    `Kỳ 01/11/2026 – 31/01/2027Bản nháp · hạn thu 01/11/2026${'30.000.000'}${NBSP}₫`,
  ]);
  await previewSettled(dialog);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('activate-preview-1440-dark.png') });
  await dialog.getByTestId('confirm-activate').click();
  await expect(toast(page)).toContainText('Đã kích hoạt hợp đồng. Hóa đơn tháng 10 đã phát hành.');
  await expect(page.getByTestId('invoice-row').filter({ hasText: 'Kỳ 01/10/2026 – 31/10/2026' }).locator('data')).toHaveText(`10.108.696${NBSP}₫`);

  const late = other.getByTestId('activate-dialog');
  await late.getByRole('textbox', { name: 'Đã thu tiền đến hết ngày' }).fill('31/10/2026');
  await previewSettled(late);
  await late.getByTestId('confirm-activate').click();
  await expect(late.getByTestId('activate-refusals')).toContainText('Hợp đồng này đã được kích hoạt ở thẻ hoặc máy khác');
  await other.screenshot({ path: test.info().outputPath('activate-already-active-1440-dark.png') });
  await expect(toast(other)).not.toContainText('Đã kích hoạt hợp đồng');

  const [stored] = await rest<{ paid_through_date: string; invoices: { period_start: string; due_date: string; status: string; invoice_lines: { amount_vnd: number }[] }[] }[]>(
    page,
    'GET',
    `leases?id=eq.${lease?.id ?? ''}&select=paid_through_date,invoices(period_start,due_date,status,invoice_lines(amount_vnd))&invoices.order=period_start`,
  );
  expect(stored).toEqual({
    paid_through_date: '2026-09-30',
    invoices: [
      { period_start: '2026-10-01', due_date: '2026-10-01', status: 'issued', invoice_lines: [{ amount_vnd: 10_108_696 }] },
      { period_start: '2026-11-01', due_date: '2026-11-01', status: 'draft', invoice_lines: [{ amount_vnd: 30_000_000 }] },
    ],
  });
});

test('rule 4: the new lease form prefills DOMAIN-VN §7 defaults, 1 tháng and metered utilities for a room, 3 tháng for the warehouse', async ({ page }) => {
  await open(page, 'me.lane4@demo.esta.test', 'dark', PHONE);
  await page.goto(newLeasePath(4, 'di-an', unitId(4, 'di-an', 8)));
  await expect(page.getByTestId('form-loading')).toHaveCount(0);
  await expect(page.getByTestId('lease-cycle').locator('option:checked')).toHaveText('1 tháng');
  await expect(page.getByTestId('lease-utilities').locator('option:checked')).toHaveText('Điện nước theo đồng hồ');
  await expect(page.getByTestId('lease-anchor').locator('option:checked')).toHaveText('Ngày bắt đầu thuê');
  await expect(page.getByRole('textbox', { name: 'Tiền thuê mỗi tháng' })).toHaveValue('3.000.000');
  await expect(page.getByRole('textbox', { name: 'Tiền cọc' })).toHaveValue('3.000.000');
  expect(await noSideScroll(page)).toBe(true);

  await page.goto(newLeasePath(4, 'bien-hoa', wholeUnitId(4, 'bien-hoa')));
  await expect(page.getByTestId('form-loading')).toHaveCount(0);
  await expect(page.getByTestId('lease-cycle').locator('option:checked')).toHaveText('3 tháng');
  await expect(page.getByTestId('lease-utilities').locator('option:checked')).toHaveText('Người thuê tự trả');
  await expect(page.getByRole('textbox', { name: 'Tiền cọc' })).toHaveValue('24.000.000');
});

test('rule 5: a draft without rent is refused at activation in Vietnamese and stays a draft (LSE-2)', async ({ page }) => {
  await open(page, 'ryan.lane5@demo.esta.test', 'light', DESKTOP);
  await page.goto(newLeasePath(5, 'bien-hoa', wholeUnitId(5, 'bien-hoa')));
  await expect(page.getByTestId('form-loading')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Tiền thuê mỗi tháng' }).fill('');
  await page.getByRole('textbox', { name: 'Ngày bắt đầu' }).fill('01/11/2026');
  await page.getByTestId('activate-lease').click();
  const dialog = page.getByTestId('activate-dialog');
  await expect(dialog.getByTestId('activate-refusals')).toContainText('Chưa có tiền thuê. Nhập tiền thuê mỗi tháng rồi lưu nháp.');
  await expect(dialog.getByTestId('activate-refusals')).toContainText('Chưa chọn người thuê.');
  await expect(dialog.getByTestId('confirm-activate')).toBeDisabled();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Hủy' }).click();

  const leaseId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  await expect(page.locator('[data-status="draft"]').first()).toHaveText('Bản nháp');
  expect(await rest(page, 'GET', `leases?id=eq.${leaseId}&select=status,rent_vnd`)).toEqual([{ status: 'draft', rent_vnd: null }]);
});

test('rule 6: a draft on Phòng 7 reopens, takes 4tr rent and a 2-month deposit, and issues no invoice', async ({ page }) => {
  await open(page, 'me.lane6@demo.esta.test', 'light', PHONE);
  await page.goto(newLeasePath(6, 'di-an', unitId(6, 'di-an', 7)));
  await expect(page.getByTestId('form-loading')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Ngày bắt đầu' }).fill('15/10/2026');
  await page.getByTestId('save-lease').click();
  await expect(page).toHaveURL(/\/rental\/leases\/[0-9a-f-]{36}$/);
  await expect(toast(page)).toContainText('Đã lưu nháp.');
  const leasePath = new URL(page.url()).pathname;

  await page.goto(rentalPath(6, 'di-an'));
  await expect(unitRow(page, 'Phòng 7').locator('[data-status="draft"]')).toHaveText('Bản nháp');
  await page.goto(leasePath);
  await expect(page.getByTestId('form-loading')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Tiền thuê mỗi tháng' }).fill('4tr');
  await page.getByRole('textbox', { name: 'Tiền cọc' }).fill('8tr');
  await page.getByTestId('save-lease').click();
  await expect(toast(page)).toContainText('Đã lưu nháp.');

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Tiền thuê mỗi tháng' })).toHaveValue('4.000.000');
  await expect(page.getByRole('textbox', { name: 'Tiền cọc' })).toHaveValue('8.000.000');
  await expect(page.locator('h1 + [data-status="draft"]')).toHaveText('Bản nháp');
  const leaseId = leasePath.split('/').at(-1) ?? '';
  expect(await rest(page, 'GET', `invoices?lease_id=eq.${leaseId}&select=id`)).toEqual([]);
});

test('rule 9: adding a room to Thủ Đức, let as a whole, is refused and adds no unit', async ({ page }) => {
  await open(page, 'ryan.lane9@demo.esta.test', 'light', DESKTOP);
  await page.goto(rentalPath(9, 'thu-duc'));
  await page.getByTestId('add-unit').click();
  const sheet = page.getByTestId('unit-sheet');
  await sheet.locator('#unit-label').fill('Phòng 1');
  await sheet.getByTestId('unit-kind').selectOption('room');
  await sheet.getByTestId('save-unit').click();
  await expect(sheet.getByTestId('form-error')).toHaveText('Không thể chia nhỏ tài sản khi đang cho thuê nguyên căn.');
  expect(await rest(page, 'GET', `units?property_id=eq.${propertyId(9, 'thu-duc')}&select=label`)).toEqual([{ label: 'Toàn bộ' }]);
});

test('rule 10: in English at 130% text, the overdue room reads 12 days overdue and the lease form stacks without clipping', async ({ page }) => {
  await open(page, 'me.lane6@demo.esta.test', 'dark', PHONE);
  const memberId = seedId('seed:member:me-lane-6');
  await rest(page, 'PATCH', `household_members?id=eq.${memberId}`, { locale: 'en', text_scale: 130 });
  try {
    await page.goto(rentalPath(6, 'di-an'));
    await expect(unitRow(page, 'Phòng 5').locator('[data-status="overdue"]')).toHaveText('12 days overdue');
    await expect(unitRow(page, 'Phòng 8').getByTestId('add-lease')).toHaveText('Add lease');
    await unitRow(page, 'Phòng 8').getByTestId('add-lease').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New lease for Phòng 8');
    await expect(page.getByTestId('form-loading')).toHaveCount(0);
    await expect(page.getByText('Monthly rent', { exact: true })).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    expect(await seriousAxeViolations(page)).toEqual([]);
  } finally {
    await rest(page, 'PATCH', `household_members?id=eq.${memberId}`, { locale: 'vi', text_scale: 100 });
  }
});

test('a viewer sees leases and invoices but no way to add or edit one', async ({ page }) => {
  await open(page, 'me.lane8@demo.esta.test', 'light', PHONE);
  const invited = 'viewer.lane8@demo.esta.test';
  const existing = await rest<unknown[]>(page, 'GET', `household_members?invited_email=eq.${invited}&select=id`);
  if (existing.length === 0) await rest(page, 'POST', 'household_members', { household_id: householdId(8), invited_email: invited, role: 'viewer' });
  await page.context().clearCookies();
  await open(page, invited, 'light', PHONE);
  await page.goto(rentalPath(8, 'di-an'));
  await expect(unitRow(page, 'Phòng 5').getByTestId('unit-tenant')).toHaveText('Hoàng Văn Em Demo');
  await expect(page.getByTestId('add-lease')).toHaveCount(0);
  await unitRow(page, 'Phòng 5').getByTestId('open-lease').click();
  await expect(page.getByText('Bạn đang xem. Chỉ thành viên trong gia đình được sửa hợp đồng.')).toBeVisible();
  await expect(page.getByTestId('lease-form')).toHaveCount(0);
  await expect(page.getByTestId('invoice-row')).toHaveCount(9);
  await page.goto(newLeasePath(8, 'di-an', unitId(8, 'di-an', 8)));
  await expect(page.getByTestId('lease-form')).toHaveCount(0);
});
