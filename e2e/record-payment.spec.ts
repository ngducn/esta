import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { join } from 'node:path';
import { parseSlot } from '../scripts/slot.ts';
import { slotEnv } from '../scripts/slot-env.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { signIn } from './helpers/inbucket';
import { accessToken } from './helpers/session';
import { setClock } from './helpers/test-clock';

const env = slotEnv(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const NBSP = ' ';
const SPEC_TODAY = '2026-10-07T09:00:00+07:00';
const householdId = (lane: number) => seedId(`seed:household:lane-${lane}`);
const invoiceId = (lane: number, unit: number, start: string) => seedId(`seed:invoice:lane-${lane}:di-an:${unit}:${start}`);
const vnd = (text: string) => `${text}${NBSP}₫`;

// `ESTA_E2E_VIDEO=1` records each rule at the phone size, for the PR's video of seed 2 in three taps and an undo.
const recording = process.env.ESTA_E2E_VIDEO === '1';
test.use(recording ? { video: { mode: 'on', size: PHONE }, launchOptions: { slowMo: 900 } } : { video: 'off' });
const holdForRecording = (page: Page) => (recording ? page.waitForTimeout(2500) : Promise.resolve());

// Groups and the default date come from the Clock, so the spec runs in the `clock` project on SPEC §9.3's day. Each rule
// reads its own lane household, and every payment a rule records through the sheet is undone after it, so a retry and
// the lanes after it start from the seed.
test.beforeEach(async ({ request }) => {
  await setClock(request, SPEC_TODAY);
});

test.afterEach(async ({ page }) => {
  if ((await page.context().cookies()).some((cookie) => cookie.name.startsWith('sb-'))) await undoRecorded(page);
});

async function open(page: Page, email: string, theme: 'light' | 'dark', viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.context().addCookies([{ name: 'esta_theme', value: theme, url: test.info().project.use.baseURL ?? '' }]);
  await signIn(page, email);
}

async function rest<T>(page: Page, method: 'GET' | 'POST' | 'PATCH', path: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: { apikey: anonKey, authorization: `Bearer ${await accessToken(page)}`, 'content-type': 'application/json', prefer: 'return=representation' },
    ...(data === undefined ? {} : { data }),
  });
  expect(response.ok(), await response.text()).toBe(true);
  const text = await response.text();
  return (text === '' ? null : JSON.parse(text)) as T;
}

/** Payments the sheet recorded carry an idempotency key; the seed's carry none. */
async function undoRecorded(page: Page) {
  const recorded = await rest<{ id: string }[]>(page, 'GET', 'payments?idempotency_key=not.is.null&select=id');
  for (const { id } of recorded) await rest(page, 'POST', 'rpc/undo_payment', { p_payment_id: id });
}

type Allocation = { amount_vnd: number; payments: { amount_vnd: number; method: string; received_on: string } };
const allocationsOf = (page: Page, invoice: string) =>
  rest<Allocation[]>(page, 'GET', `payment_allocations?invoice_id=eq.${invoice}&select=amount_vnd,payments!inner(amount_vnd,method,received_on,idempotency_key)&payments.idempotency_key=not.is.null`);

async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const group = (page: Page, key: 'overdue' | 'due' | 'notDue' | 'paid') => page.getByTestId(`group-${key}`);
const row = (scope: Locator, place: string) => scope.getByTestId('collections-row').filter({ has: scope.page().getByTestId('row-place').getByText(place, { exact: true }) });
const sheet = (page: Page) => page.getByTestId('record-payment-sheet');
const toast = (page: Page) => page.getByRole('region', { name: /Thông báo|Notifications/ });

/** Every trusted tap or click the page receives from here on; the spec's own reads are not taps. */
async function countTaps(page: Page) {
  await page.evaluate(() => {
    const counter = window as unknown as { estaTaps: number };
    counter.estaTaps = 0;
    document.addEventListener('pointerdown', (event) => {
      if (event.isTrusted) counter.estaTaps += 1;
    }, true);
  });
  return () => page.evaluate(() => (window as unknown as { estaTaps: number }).estaTaps);
}

test('rule 2: SPEC §9.4 seed 2, Phòng 5 in three taps with the prefilled amount, then Hoàn tác (LSE-7)', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  await page.goto('/collections');
  const phong5 = row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An');
  await expect(phong5).toBeVisible();
  await holdForRecording(page);
  const taps = await countTaps(page);

  await phong5.getByTestId('row-action-record-payment').click();
  await expect(sheet(page).getByTestId('money-preview')).toHaveText(vnd('2.800.000'));
  await expect(sheet(page).getByTestId('payment-allocation')).toContainText(`Tháng 9: ${vnd('2.800.000')}, trả đủ`);
  await expect(sheet(page).getByTestId('payment-date')).toHaveText('Hôm nay, 07/10/2026');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await sheet(page).getByRole('radio', { name: 'Tiền mặt' }).click();
  await sheet(page).getByTestId('payment-save').click();
  await expect(toast(page)).toContainText(`Đã ghi nhận ${vnd('2.800.000')} từ Phòng 5.`);
  expect(await taps(), 'taps from the row to the saved payment').toBe(3);

  const [allocation, ...others] = await allocationsOf(page, invoiceId(2, 5, '2026-09-25'));
  expect(others).toEqual([]);
  expect(allocation).toMatchObject({ amount_vnd: 2_800_000, payments: { amount_vnd: 2_800_000, method: 'cash', received_on: '2026-10-07' } });
  await expect(group(page, 'overdue').getByTestId('collections-row')).toHaveCount(0);

  await toast(page).getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(toast(page)).toContainText('Đã hoàn tác khoản thu từ Phòng 5.');
  await expect(row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An')).toBeVisible();
  expect(await allocationsOf(page, invoiceId(2, 5, '2026-09-25'))).toEqual([]);
  await holdForRecording(page);
});

test('a sheet left open on Phòng 5 while another tab records it is refused in words, and one payment exists', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  await page.goto('/collections');
  await row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An').getByTestId('row-action-record-payment').click();
  await sheet(page).getByRole('radio', { name: 'Tiền mặt' }).click();

  const other = await page.context().newPage();
  await other.goto('/collections');
  await row(group(other, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An').getByTestId('row-action-record-payment').click();
  await sheet(other).getByRole('radio', { name: 'Chuyển khoản' }).click();
  await sheet(other).getByTestId('payment-save').click();
  await expect(toast(other)).toContainText(`Đã ghi nhận ${vnd('2.800.000')} từ Phòng 5.`);

  await sheet(page).getByTestId('payment-save').click();
  await expect(toast(page)).toContainText('Phòng 5 vừa được ghi nhận tiền nên khoản này chưa lưu. Xem số mới trên bảng.');
  await expect(sheet(page)).toBeHidden();
  await expect(group(page, 'overdue').getByTestId('collections-row'), 'the board shows September paid').toHaveCount(0);
  expect(await rest<unknown[]>(page, 'GET', `payments?household_id=eq.${householdId(2)}&idempotency_key=not.is.null&select=id`)).toHaveLength(1);
  expect(await allocationsOf(page, invoiceId(2, 5, '2026-10-25')), 'October is not paid by the refused sheet').toEqual([]);
});

test('rule 3: Phòng 3 prefills its October amount and moves from Chưa đến hạn to Đã thu', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'dark', PHONE);
  const [balance] = await rest<{ outstanding_vnd: number }[]>(page, 'GET', `invoice_balances?id=eq.${invoiceId(3, 3, '2026-10-25')}&select=outstanding_vnd`);
  await page.goto('/collections');
  await row(group(page, 'notDue'), 'Phòng 3, Dãy trọ Dĩ An').getByTestId('row-action-record-payment').click();
  await expect(sheet(page).getByTestId('money-preview')).toHaveAttribute('value', String(balance?.outstanding_vnd));
  await sheet(page).getByRole('radio', { name: 'Tiền mặt' }).click();
  await sheet(page).getByTestId('payment-save').click();
  await expect(toast(page)).toContainText(`Đã ghi nhận ${vnd('2.500.000')} từ Phòng 3.`);
  await expect(row(group(page, 'paid'), 'Phòng 3, Dãy trọ Dĩ An')).toBeVisible();
  await expect(row(group(page, 'notDue'), 'Phòng 3, Dãy trọ Dĩ An')).toHaveCount(0);
});

test('rule 4: at 1440 Hoàn tác returns Phòng 3 to Chưa đến hạn and leaves no payment on the invoice', async ({ page }) => {
  await open(page, 'ryan.lane4@demo.esta.test', 'dark', DESKTOP);
  await page.goto('/collections');
  await row(group(page, 'notDue'), 'Phòng 3, Dãy trọ Dĩ An').getByTestId('row-action-record-payment').click();
  await sheet(page).getByRole('radio', { name: 'Chuyển khoản' }).click();
  await sheet(page).getByTestId('payment-save').click();
  await expect(row(group(page, 'paid'), 'Phòng 3, Dãy trọ Dĩ An')).toBeVisible();
  await toast(page).getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(row(group(page, 'notDue'), 'Phòng 3, Dãy trọ Dĩ An')).toBeVisible();
  expect(await allocationsOf(page, invoiceId(4, 3, '2026-10-25'))).toEqual([]);
  const left = await rest<unknown[]>(page, 'GET', `payments?household_id=eq.${householdId(4)}&idempotency_key=not.is.null&select=id`);
  expect(left).toEqual([]);
});

test('rule 5: 3tr5 by transfer on Phòng 5 October previews 3.500.000 ₫, settles September and leaves October part paid', async ({ page }) => {
  await open(page, 'me.lane5@demo.esta.test', 'light', PHONE);
  await page.goto('/collections');
  await row(group(page, 'notDue'), 'Phòng 5, Dãy trọ Dĩ An').getByTestId('row-action-record-payment').click();
  const amount = sheet(page).getByRole('textbox', { name: 'Số tiền nhận' });
  await expect(amount).toHaveValue('5.600.000');
  await amount.fill('3tr5');
  await expect(sheet(page).getByTestId('money-preview')).toHaveText(vnd('3.500.000'));
  await expect(sheet(page).getByTestId('payment-allocation').getByRole('listitem')).toHaveText([
    `Tháng 9: ${vnd('2.800.000')}, trả đủ`,
    `Tháng 10: ${vnd('700.000')}, còn thiếu ${vnd('2.100.000')}`,
  ]);
  await sheet(page).getByRole('radio', { name: 'Chuyển khoản' }).click();
  await sheet(page).getByTestId('payment-save').click();
  await expect(toast(page)).toContainText(`Đã ghi nhận ${vnd('3.500.000')} từ Phòng 5.`);
  const october = row(group(page, 'notDue'), 'Phòng 5, Dãy trọ Dĩ An');
  await expect(october.getByTestId('row-partial')).toHaveText('Thu một phần');
  await expect(october.locator('data')).toHaveText(vnd('2.100.000'));
  await expect(group(page, 'overdue').getByTestId('collections-row')).toHaveCount(0);
});

test('rule 6: more than Phòng 2 owes names the credit before saving, and the allocation stops at what was owed', async ({ page }) => {
  await open(page, 'ryan.lane6@demo.esta.test', 'light', DESKTOP);
  await page.goto('/collections');
  await row(group(page, 'notDue'), 'Phòng 2, Dãy trọ Dĩ An').getByTestId('row-action-record-payment').click();
  await sheet(page).getByRole('textbox', { name: 'Số tiền nhận' }).fill('3tr');
  await expect(sheet(page).getByTestId('payment-credit')).toHaveText(`Dư ${vnd('500.000')}, ghi thành tiền trả trước của Trần Thị Bình Demo.`);
  await sheet(page).getByRole('radio', { name: 'Chuyển khoản' }).click();
  await sheet(page).getByTestId('payment-save').click();
  await expect(toast(page)).toContainText(`Đã ghi nhận ${vnd('3.000.000')} từ Phòng 2.`);
  const allocations = await allocationsOf(page, invoiceId(6, 2, '2026-10-25'));
  expect(allocations).toMatchObject([{ amount_vnd: 2_500_000, payments: { amount_vnd: 3_000_000, method: 'bank_transfer' } }]);
});

test('Chọn hóa đơn: unticking September sends the whole payment to October', async ({ page }) => {
  await open(page, 'ryan.lane1@demo.esta.test', 'light', DESKTOP);
  await page.goto('/collections');
  await row(group(page, 'notDue'), 'Phòng 5, Dãy trọ Dĩ An').getByTestId('row-action-record-payment').click();
  await sheet(page).getByRole('textbox', { name: 'Số tiền nhận' }).fill('2tr8');
  await sheet(page).getByTestId('payment-choose').click();
  await sheet(page).getByRole('checkbox', { name: 'Tháng 9, hạn 25/09/2026' }).click();
  await expect(sheet(page).getByTestId('payment-allocation').getByRole('listitem')).toHaveText([`Tháng 10: ${vnd('2.800.000')}, trả đủ`]);
  await sheet(page).getByRole('radio', { name: 'Tiền mặt' }).click();
  await sheet(page).getByTestId('payment-save').click();
  await expect(row(group(page, 'paid'), 'Phòng 5, Dãy trọ Dĩ An')).toBeVisible();
  await expect(row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An')).toBeVisible();
  expect(await allocationsOf(page, invoiceId(1, 5, '2026-09-25'))).toEqual([]);
  expect(await allocationsOf(page, invoiceId(1, 5, '2026-10-25'))).toMatchObject([{ amount_vnd: 2_800_000 }]);
});

test('rule 9: two quick taps on Lưu for Phòng 6 record one payment', async ({ page }) => {
  await open(page, 'me.lane9@demo.esta.test', 'light', PHONE);
  await page.goto('/collections');
  await row(group(page, 'notDue'), 'Phòng 6, Dãy trọ Dĩ An').getByTestId('row-action-record-payment').click();
  await sheet(page).getByRole('radio', { name: 'Tiền mặt' }).click();
  await sheet(page).getByTestId('payment-save').dblclick();
  await expect(toast(page)).toContainText(`Đã ghi nhận ${vnd('2.800.000')} từ Phòng 6.`);
  await expect(row(group(page, 'paid'), 'Phòng 6, Dãy trọ Dĩ An')).toBeVisible();
  expect(await allocationsOf(page, invoiceId(9, 6, '2026-10-25'))).toHaveLength(1);
  expect(await rest<unknown[]>(page, 'GET', `payments?household_id=eq.${householdId(9)}&idempotency_key=not.is.null&select=id`)).toHaveLength(1);
});

test('rule 10: in English at 130% text and dark, Phòng 5 in three taps, with the amount and Save on screen', async ({ page }) => {
  const member = `household_members?id=eq.${seedId('seed:member:me-lane-10')}`;
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  await rest(page, 'PATCH', member, { locale: 'en', text_scale: 130 });
  try {
    await page.goto('/collections');
    const taps = await countTaps(page);
    await row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An').getByTestId('row-action-record-payment').click();
    const amount = sheet(page).getByRole('textbox', { name: 'Amount received' });
    await expect(amount).toHaveValue('2.800.000');
    const box = await amount.boundingBox();
    expect(box !== null && box.x >= 0 && box.x + box.width <= PHONE.width, 'the amount field fits the width').toBe(true);
    expect(await amount.evaluate((input: HTMLInputElement) => input.scrollWidth <= input.clientWidth), 'the amount is not clipped').toBe(true);
    await sheet(page).getByRole('radio', { name: 'Cash' }).click();
    await expect(sheet(page).getByTestId('payment-save')).toBeInViewport({ ratio: 1 });
    await sheet(page).getByTestId('payment-save').click();
    await expect(toast(page)).toContainText(`Recorded 2,800,000${NBSP}₫ from Phòng 5.`);
    expect(await taps()).toBe(3);
  } finally {
    await rest(page, 'PATCH', member, { locale: 'vi', text_scale: 100 });
  }
});

test('an amount or a date that does not read is refused in words, and nothing is recorded', async ({ page }) => {
  await open(page, 'me.lane8@demo.esta.test', 'dark', PHONE);
  await page.goto('/collections');
  await row(group(page, 'notDue'), 'Phòng 4, Dãy trọ Dĩ An').getByTestId('row-action-record-payment').click();
  const amount = sheet(page).getByRole('textbox', { name: 'Số tiền nhận' });
  await sheet(page).getByTestId('payment-save').click();
  await expect(sheet(page).getByTestId('payment-error')).toHaveText('Chọn Tiền mặt hoặc Chuyển khoản.');
  await sheet(page).getByRole('radio', { name: 'Tiền mặt' }).click();
  await amount.fill('3tr5x');
  await sheet(page).getByTestId('payment-save').click();
  await expect(sheet(page).getByTestId('payment-error')).toHaveText('Số tiền chưa đúng. Viết số tiền như 3.500.000, 3tr5 hoặc 850k.');
  await amount.fill('');
  await sheet(page).getByTestId('payment-save').click();
  await expect(sheet(page).getByTestId('payment-error')).toHaveText('Nhập số tiền đã nhận.');
  await amount.fill('1tr');
  await sheet(page).getByTestId('payment-change-date').click();
  const date = sheet(page).getByRole('textbox', { name: 'Ngày nhận' });
  await date.fill('31/09/2026');
  await sheet(page).getByTestId('payment-save').click();
  await expect(sheet(page).getByTestId('payment-error')).toHaveText('Ngày chưa đúng. Nhập theo dạng 07/10/2026.');
  await date.fill('08/10/2026');
  await sheet(page).getByTestId('payment-save').click();
  await expect(sheet(page).getByTestId('payment-error')).toHaveText('Ngày nhận không được sau hôm nay.');
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await allocationsOf(page, invoiceId(8, 4, '2026-10-25'))).toEqual([]);
});

test('offline, the sheet says so and Lưu records nothing until the network is back', async ({ page }) => {
  await open(page, 'me.lane8@demo.esta.test', 'light', PHONE);
  await page.goto('/collections');
  await row(group(page, 'notDue'), 'Phòng 4, Dãy trọ Dĩ An').getByTestId('row-action-record-payment').click();
  await sheet(page).getByRole('radio', { name: 'Tiền mặt' }).click();
  await page.context().setOffline(true);
  await expect(sheet(page).getByTestId('payment-offline')).toHaveText('Đang mất mạng. Khoản thu chỉ lưu được khi có mạng lại.');
  await sheet(page).getByTestId('payment-save').click();
  await expect(sheet(page).getByTestId('payment-error')).toHaveText('Chưa lưu được. Kiểm tra kết nối mạng rồi thử lại.');
  await page.context().setOffline(false);
  await sheet(page).getByTestId('payment-save').click();
  await expect(toast(page)).toContainText(`Đã ghi nhận ${vnd('2.500.000')} từ Phòng 4.`);
  expect(await allocationsOf(page, invoiceId(8, 4, '2026-10-25'))).toHaveLength(1);
});

test('a viewer has no Ghi nhận', async ({ page }) => {
  await open(page, 'me.lane7@demo.esta.test', 'light', PHONE);
  const invited = 'viewer.lane7@demo.esta.test';
  const existing = await rest<unknown[]>(page, 'GET', `household_members?invited_email=eq.${invited}&select=id`);
  if (existing.length === 0) await rest(page, 'POST', 'household_members', { household_id: householdId(7), invited_email: invited, role: 'viewer' });
  await page.goto('/collections');
  await expect(row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An').getByTestId('row-action-record-payment')).toBeVisible();
  await page.context().clearCookies();
  await open(page, invited, 'light', PHONE);
  await page.goto('/collections');
  await expect(row(group(page, 'overdue'), 'Phòng 5, Dãy trọ Dĩ An')).toBeVisible();
  await expect(page.getByTestId('row-action-record-payment')).toHaveCount(0);
});
