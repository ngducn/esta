import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';
import { query } from '../scripts/db-checksum.ts';
import { parseSlot, slotWorkdir } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { signIn } from './helpers/inbucket';
import { accessToken } from './helpers/session';
import { setClock } from './helpers/test-clock';

const root = join(import.meta.dirname, '..');
const slot = parseSlot(process.env.ESTA_SLOT);
const env = slotEnv(root, slot);
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const NBSP = String.fromCharCode(160);
const vnd = (text: string) => `${text}${NBSP}₫`;
const propertyId = (lane: number, key: string) => seedId(`seed:property:lane-${lane}:${key}`);
const seedLease = (lane: number, key: string, unit: number) => seedId(`seed:lease:lane-${lane}:${key}:${unit}`);
const leasePath = (lane: number, key: string, unit: number) => `/properties/${propertyId(lane, key)}/rental/leases/${seedLease(lane, key, unit)}`;

// `ESTA_E2E_VIDEO=1` records each rule at the phone size, for the PR's video of the deposit settled after Phòng 7 left.
const recording = process.env.ESTA_E2E_VIDEO === '1';
test.use(recording ? { video: { mode: 'on', size: PHONE }, launchOptions: { slowMo: 900 } } : { video: 'off' });
const holdForRecording = (page: Page) => (recording ? page.waitForTimeout(2500) : Promise.resolve());

// The sheets default to the Clock's day and refuse a later one, so the spec runs in the `clock` project on SPEC §9.3's day.
test.beforeEach(async ({ request }) => {
  await setClock(request, '2026-10-07T09:00:00+07:00');
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

async function rest<T>(page: Page, path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', data?: Record<string, unknown>): Promise<T> {
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

const toast = (page: Page) => page.getByRole('region', { name: /Thông báo|Notifications/ });
const noSideScroll = (page: Page) => page.locator('html').evaluate((html) => html.scrollWidth <= html.clientWidth);
const ledger = (page: Page) => page.getByTestId('deposit-ledger');
const held = (page: Page) => ledger(page).getByTestId('deposit-held').locator('data');
const entries = (page: Page) => ledger(page).getByTestId('deposit-entry');

/**
 * Phòng 7 of lane 8 as the flow below assumes it: the tenant left on 15/09/2026 still owing 1.300.000 ₫ of the last month,
 * and the 2.800.000 ₫ deposit untouched. The seed pays that month in full (SPEC §9.3), so the seeded payment is cut to
 * 1.500.000 ₫ and anything an earlier run applied, deducted or refunded is removed. Run against the slot's local stack only.
 */
function owePartOfPhong7LastMonth() {
  const workdir = slotWorkdir(root, slot);
  const lease = seedLease(8, 'di-an', 7);
  const payment = seedId('seed:payment:lane-8:di-an:7:2026-08-16:1');
  query(workdir, `delete from public.deposit_entries where lease_id = '${lease}' and kind <> 'received' returning id`);
  query(
    workdir,
    `delete from public.payments where method = 'deposit' and id in (
       select a.payment_id from public.payment_allocations a join public.invoices i on i.id = a.invoice_id where i.lease_id = '${lease}'
     ) returning id`,
  );
  query(workdir, `update public.payment_allocations set amount_vnd = 1500000 where payment_id = '${payment}' returning id`);
  query(workdir, `update public.payments set amount_vnd = 1500000 where id = '${payment}' returning id`);
}

test('rule 1: the ended Phòng 7 lease holds its 2.800.000 ₫ deposit in one received row, offers deduct and refund, and Tài sản shows the household total', async ({ page }) => {
  await open(page, 'ryan.lane7@demo.esta.test', 'dark', DESKTOP);
  await page.goto(leasePath(7, 'di-an', 7));
  await expect(page.getByTestId('lease-status')).toHaveText('Đã kết thúc');
  await expect(held(page)).toHaveText(vnd('2.800.000'));
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page).first()).toHaveAttribute('data-kind', 'received');
  await expect(entries(page).first()).toContainText('Nhận cọc');
  await expect(entries(page).first()).toContainText('16/09/2025');
  await expect(entries(page).first()).toContainText(`+${vnd('2.800.000')}`);
  await expect(ledger(page).getByTestId('deposit-actions').getByRole('button')).toHaveText(['Khấu trừ', 'Trả lại cọc']);
  await expect(page.getByTestId('lease-terminate')).toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('phong7-held-1440-dark.png'), fullPage: true });

  await page.goto('/properties');
  await expect(page.getByTestId('deposit-held-total')).toHaveText(`Đang giữ ${vnd('126.400.000')} tiền cọc của người thuê`);
  await page.screenshot({ path: test.info().outputPath('properties-held-1440-dark.png') });
});

test('rule 2: Mẹ uses Phòng 7 deposit for the 1.300.000 ₫ the last month still owes, deducts 300.000 ₫ for paint with a note, and refunds the rest', async ({ page }) => {
  owePartOfPhong7LastMonth();
  await open(page, 'me.lane8@demo.esta.test', 'light', PHONE);
  await page.goto(leasePath(8, 'di-an', 7));
  await expect(held(page)).toHaveText(vnd('2.800.000'));
  await expect(ledger(page).getByTestId('deposit-actions').getByRole('button')).toHaveText(['Trừ vào tiền thuê', 'Khấu trừ', 'Trả lại cọc']);
  await holdForRecording(page);

  await ledger(page).getByTestId('deposit-applied').click();
  const sheet = page.getByTestId('deposit-sheet');
  await expect(sheet.getByRole('heading')).toHaveText('Trừ cọc vào tiền thuê');
  await expect(sheet.getByRole('radio')).toHaveCount(1);
  await expect(sheet.getByRole('radio')).toBeChecked();
  await expect(sheet.locator('label:has(input[type="radio"])')).toContainText('Kỳ từ 16/08/2026 đến 15/09/2026');
  await expect(sheet.locator('label:has(input[type="radio"])')).toContainText(`còn nợ ${vnd('1.300.000')}`);
  await expect(sheet.getByRole('textbox', { name: 'Số tiền trừ vào hóa đơn' })).toHaveValue('1.300.000');
  await expect(sheet.getByTestId('deposit-held-after')).toHaveText(`Sau khi lưu, còn giữ ${vnd('1.500.000')}`);
  await settled(sheet.getByTestId('deposit-save'));
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSideScroll(page)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('apply-sheet-390-light.png') });
  await holdForRecording(page);
  await sheet.getByTestId('deposit-save').click();

  await expect(toast(page)).toContainText(`Đã trừ ${vnd('1.300.000')} tiền cọc vào hóa đơn.`);
  await expect(held(page)).toHaveText(vnd('1.500.000'));
  const applied = page.locator('[data-testid="deposit-entry"][data-kind="applied"]');
  await expect(applied).toContainText('Cho hóa đơn kỳ từ 16/08/2026');
  await expect(applied).toContainText(`−${vnd('1.300.000')}`);
  const lastInvoice = seedId('seed:invoice:lane-8:di-an:7:2026-08-16');
  expect(await rest(page, `invoice_balances?id=eq.${lastInvoice}&select=outstanding_vnd,payment_status`)).toEqual([{ outstanding_vnd: 0, payment_status: 'paid' }]);
  expect(
    await rest(page, `payment_allocations?invoice_id=eq.${lastInvoice}&select=amount_vnd,payments(method,source,amount_vnd)&order=amount_vnd`),
  ).toEqual([
    { amount_vnd: 1_300_000, payments: { method: 'deposit', source: 'deposit_application', amount_vnd: 1_300_000 } },
    { amount_vnd: 1_500_000, payments: { method: 'bank_transfer', source: 'manual', amount_vnd: 1_500_000 } },
  ]);
  await holdForRecording(page);

  await ledger(page).getByTestId('deposit-deduction').click();
  await sheet.getByRole('textbox', { name: 'Số tiền khấu trừ' }).fill('300k');
  await expect(sheet.getByTestId('deposit-held-after')).toHaveText(`Sau khi lưu, còn giữ ${vnd('1.200.000')}`);
  await sheet.getByTestId('deposit-save').click();
  await expect(sheet.getByText('Ghi lý do khấu trừ.')).toBeVisible();
  await sheet.getByTestId('deposit-note').fill('Sơn lại tường Demo');
  await holdForRecording(page);
  await sheet.getByTestId('deposit-save').click();
  await expect(toast(page)).toContainText(`Đã khấu trừ ${vnd('300.000')} tiền cọc.`);
  await expect(held(page)).toHaveText(vnd('1.200.000'));
  await expect(page.locator('[data-testid="deposit-entry"][data-kind="deduction"]')).toContainText('Sơn lại tường Demo');

  await ledger(page).getByTestId('deposit-refunded').click();
  await expect(sheet.getByRole('textbox', { name: 'Số tiền trả lại' })).toHaveValue('1.200.000');
  await expect(sheet.getByTestId('deposit-held-after')).toHaveText(`Sau khi lưu, còn giữ ${vnd('0')}`);
  await holdForRecording(page);
  await sheet.getByTestId('deposit-save').click();
  await expect(toast(page)).toContainText(`Đã ghi trả lại ${vnd('1.200.000')} tiền cọc.`);
  await expect(held(page)).toHaveText(vnd('0'));
  await expect(ledger(page)).toContainText('Không còn giữ tiền cọc nào cho hợp đồng này.');
  await expect(entries(page)).toHaveCount(4);
  expect(await entries(page).evaluateAll((rows) => rows.map((row) => row.getAttribute('data-kind')))).toEqual(['received', 'applied', 'deduction', 'refunded']);
  await expect(ledger(page).getByTestId('deposit-actions')).toHaveCount(0);
  expect(await noSideScroll(page)).toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await holdForRecording(page);
  await page.screenshot({ path: test.info().outputPath('settled-390-light.png'), fullPage: true });
});

test('rule 3: a refund past the 2.800.000 ₫ held is refused in the sheet before saving, and by the database for a direct call or write', async ({ page }) => {
  await open(page, 'me.lane9@demo.esta.test', 'dark', PHONE);
  const lease = seedLease(9, 'di-an', 7);
  await page.goto(leasePath(9, 'di-an', 7));
  await ledger(page).getByTestId('deposit-refunded').click();
  const sheet = page.getByTestId('deposit-sheet');
  const amount = sheet.getByRole('textbox', { name: 'Số tiền trả lại' });
  await amount.fill('3tr');
  await expect(sheet.getByTestId('deposit-overdraw')).toHaveText(`Nhiều hơn số tiền cọc đang giữ (${vnd('2.800.000')}).`);
  await expect(sheet.getByTestId('deposit-save')).toBeDisabled();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('refund-refused-390-dark.png') });

  const refused = await call(page, 'POST', 'rpc/record_deposit_entry', {
    p_lease_id: lease,
    p_kind: 'refunded',
    p_amount_vnd: 2_800_001,
    p_on_date: '2026-10-07',
    p_idempotency_key: crypto.randomUUID(),
  });
  expect(await refused.json()).toMatchObject({ code: '23514', message: 'ESTA_DEPOSIT_EXCEEDS_HELD' });
  const direct = await call(page, 'POST', 'deposit_entries', {
    household_id: seedId('seed:household:lane-9'),
    lease_id: lease,
    kind: 'refunded',
    amount_vnd: 100_000,
    on_date: '2026-10-07',
  });
  expect(direct.status()).toBe(403);
  expect(await rest(page, `lease_deposits?lease_id=eq.${lease}&select=held_vnd`)).toEqual([{ held_vnd: 2_800_000 }]);

  await amount.fill('2tr8');
  await expect(sheet.getByTestId('deposit-held-after')).toHaveText(`Sau khi lưu, còn giữ ${vnd('0')}`);
  await page.route(/\/properties\//, (route) => (route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.fallback()));
  await sheet.getByTestId('deposit-save').click();
  await expect(sheet.getByTestId('deposit-error')).toHaveText('Chưa lưu được. Kiểm tra kết nối mạng rồi thử lại.');
  await page.screenshot({ path: test.info().outputPath('refund-offline-390-dark.png') });
  await page.unrouteAll();
  expect(await rest(page, `lease_deposits?lease_id=eq.${lease}&select=held_vnd`)).toEqual([{ held_vnd: 2_800_000 }]);
});

test('rule 4: an active lease takes another deposit payment, and the sheet refuses a date after today', async ({ page }) => {
  await open(page, 'ryan.lane9@demo.esta.test', 'light', DESKTOP);
  const lease = seedLease(9, 'di-an', 1);
  const [{ held_vnd: before }] = await rest<[{ held_vnd: number }]>(page, `lease_deposits?lease_id=eq.${lease}&select=held_vnd`);
  await page.goto(leasePath(9, 'di-an', 1));
  await expect(ledger(page).getByTestId('deposit-actions').getByRole('button')).toHaveText(['Nhận cọc', 'Trừ vào tiền thuê', 'Khấu trừ', 'Trả lại cọc']);
  await ledger(page).getByTestId('deposit-received').click();
  const sheet = page.getByTestId('deposit-sheet');
  await sheet.getByRole('textbox', { name: 'Số tiền nhận' }).fill('500k');
  await sheet.getByRole('textbox', { name: 'Ngày nhận cọc' }).fill('08/10/2026');
  await sheet.getByTestId('deposit-save').click();
  await expect(sheet.getByTestId('deposit-error')).toHaveText('Ngày không được sau hôm nay.');
  await sheet.getByRole('textbox', { name: 'Ngày nhận cọc' }).fill('07/10/2026');
  await sheet.getByTestId('deposit-note').fill('Người thuê đóng thêm cọc Demo');
  await settled(sheet.getByTestId('deposit-save'));
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('receive-sheet-1440-light.png') });
  await sheet.getByTestId('deposit-save').click();
  await expect(toast(page)).toContainText(`Đã ghi nhận ${vnd('500.000')} tiền cọc.`);
  expect(await rest(page, `lease_deposits?lease_id=eq.${lease}&select=held_vnd`)).toEqual([{ held_vnd: before + 500_000 }]);
  await expect(page.locator('[data-testid="deposit-entry"]').last()).toContainText('Người thuê đóng thêm cọc Demo');
  await page.screenshot({ path: test.info().outputPath('received-1440-light.png'), fullPage: true });
});

test('rule 5: a new lease with nothing recorded shows the empty deposit, and Nhận cọc opens prefilled with the deposit its terms name', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'dark', PHONE);
  const property = propertyId(3, 'di-an');
  const units = await rest<{ label: string }[]>(page, `units?property_id=eq.${property}&select=label`);
  const label = `Phòng ${Math.max(...units.map((unit) => Number(/^Phòng (\d+)$/.exec(unit.label)?.[1] ?? 0))) + 1}`;
  const [unit] = await rest<{ id: string }[]>(page, 'units', 'POST', { household_id: seedId('seed:household:lane-3'), property_id: property, label, kind: 'room', list_rent_vnd: 3_000_000 });
  const [lease] = await rest<{ id: string }[]>(page, 'leases', 'POST', {
    household_id: seedId('seed:household:lane-3'),
    property_id: property,
    unit_id: unit?.id,
    tenant_party_id: seedId('seed:party:tenant-lane-3:di-an:7'),
    start_date: '2026-10-01',
    end_date: '2027-09-30',
    rent_vnd: 3_000_000,
    deposit_vnd: 6_000_000,
  });
  await rest(page, 'rpc/activate_lease', 'POST', { p_lease_id: lease?.id });
  await page.goto(`/properties/${property}/rental/leases/${lease?.id ?? ''}`);
  await expect(ledger(page)).toContainText('Chưa ghi nhận tiền cọc');
  await expect(ledger(page).getByTestId('deposit-actions').getByRole('button')).toHaveText(['Nhận cọc']);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await ledger(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('empty-390-dark.png') });

  await ledger(page).getByTestId('deposit-received').click();
  const sheet = page.getByTestId('deposit-sheet');
  await expect(sheet.getByRole('textbox', { name: 'Số tiền nhận' })).toHaveValue('6.000.000');
  await expect(sheet.getByTestId('deposit-held-after')).toHaveText(`Sau khi lưu, còn giữ ${vnd('6.000.000')}`);
  await sheet.getByTestId('deposit-save').click();
  await expect(toast(page)).toContainText(`Đã ghi nhận ${vnd('6.000.000')} tiền cọc.`);
  await expect(held(page)).toHaveText(vnd('6.000.000'));
  await expect(entries(page)).toHaveCount(1);
  expect(await noSideScroll(page)).toBe(true);
});

test('rule 6: in English at 130% text, a long deduction note and every ledger row wrap without clipping', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'light', PHONE);
  const memberId = seedId('seed:member:me-lane-10');
  const lease = seedLease(10, 'di-an', 6);
  await rest(page, `household_members?id=eq.${memberId}`, 'PATCH', { locale: 'en', text_scale: 130 });
  try {
    await rest(page, 'rpc/record_deposit_entry', 'POST', {
      p_lease_id: lease,
      p_kind: 'deduction',
      p_amount_vnd: 150_000,
      p_on_date: '2026-10-07',
      p_idempotency_key: crypto.randomUUID(),
      p_note: 'Thay bóng đèn, sửa vòi nước và vệ sinh lại máy lạnh phòng sau khi người thuê báo hỏng vào cuối tuần trước, có hóa đơn của thợ Demo',
    });
    await page.goto(leasePath(10, 'di-an', 6));
    await expect(ledger(page).getByRole('heading')).toHaveText('Deposit');
    await expect(page.locator('[data-testid="deposit-entry"][data-kind="deduction"]').last()).toContainText('Deducted');
    const clipped = await entries(page).evaluateAll((rows) => rows.filter((row) => row.scrollWidth > row.clientWidth).length);
    expect(clipped).toBe(0);
    expect(await noSideScroll(page)).toBe(true);
    expect(await seriousAxeViolations(page)).toEqual([]);
    await ledger(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('long-note-en-130-390-light.png') });
  } finally {
    await rest(page, `household_members?id=eq.${memberId}`, 'PATCH', { locale: 'vi', text_scale: 100 });
  }
});
