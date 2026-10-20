import { expect, request as playwrightRequest, test, type Page } from '@playwright/test';
import { isoDate } from '../packages/core/src/date/iso-date.ts';
import { vnd as money } from '../packages/core/src/money/vnd.ts';
import { draftReminder, type ReminderInput } from '../packages/core/src/reminder/templates.ts';
import { decodeQrPng } from '../scripts/decode-qr.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { inEnglishAt130, memberRest } from './helpers/auth-api';
import { boardRow, storedInvoice } from './helpers/board';
import { freshLease } from './helpers/leases';
import { laneHousehold, laneInvoice } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { DESKTOP, noSidewaysScroll, open, PHONE, recordForPr, seriousAxeViolations, START } from './helpers/wizard';

const holdForRecording = recordForPr();

// Overdue days and the board's month come from the Clock, so the spec runs in the `clock` project on SPEC §9.3's day.
// Lanes 6 and 9 keep Phòng 5 overdue and Phòng 3 not yet due through every earlier clock spec.
test.beforeEach(async ({ page, request }) => {
  await setClock(request, START);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
});

async function stored(page: Page, invoiceId: string): Promise<{ token: string; memoCode: string }> {
  const invoice = await storedInvoice(page, invoiceId);
  expect(invoice.share_token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  return { token: invoice.share_token ?? '', memoCode: invoice.memo_code };
}

const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());
const origin = () => test.info().project.use.baseURL ?? '';

/** SPEC §9.3 on 2026-10-07: Phòng 5's September bill, unpaid and 12 days late. */
const phong5 = (token: string): ReminderInput => ({
  timing: { situation: 'overdue', days: 12 },
  form: 'anh_chi',
  tenantName: 'Hoàng Văn Em Demo',
  place: 'Phòng 5, Dãy trọ Dĩ An',
  periodStart: isoDate('2026-09-25'),
  periodEnd: isoDate('2026-10-24'),
  dueDate: isoDate('2026-09-25'),
  amountVnd: money(2_800_000),
  qrUrl: `${origin()}/q/${token}`,
});

test('LSE-11: Nhắc qua Zalo on overdue Phòng 5 copies a polite Vietnamese reminder and links Zalo to the tenant’s number', async ({ page }) => {
  await open(page, 'me.lane6@demo.esta.test', 'light', PHONE);
  const { token } = await stored(page, laneInvoice(6, 'di-an', 5, '2026-09-25'));
  await page.goto('/collections');
  const overdue = boardRow(page, 'overdue', 'Phòng 5, Dãy trọ Dĩ An');
  await expect(overdue.getByRole('button')).toHaveText(['Ghi nhận', 'Mã QR', 'Nhắc qua Zalo']);
  await overdue.getByTestId('row-action-remind').click();

  const sheet = page.getByTestId('reminder-sheet');
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('Phòng 5, Dãy trọ Dĩ An');
  await expect(sheet).toContainText('Hoàng Văn Em Demo');
  await expect(sheet).toContainText('0901 111 005');
  await expect(sheet.getByRole('radio', { name: 'Anh/chị' })).toBeChecked();
  const expected = draftReminder(phong5(token));
  await expect(sheet.getByTestId('reminder-text')).toHaveText(expected);
  await expect(sheet.getByTestId('reminder-text')).toHaveAttribute('lang', 'vi');

  await sheet.getByTestId('reminder-copy').click();
  await expect(sheet.getByTestId('reminder-copy-status')).toHaveText('Đã sao chép. Mở Zalo rồi dán vào ô tin nhắn.');
  const copied = await clipboard(page);
  expect(copied).toBe(expected);
  // The seed puts Demo last in every name, so the given name the greeting uses reads Demo here.
  for (const fact of ['Chào anh/chị Demo.', 'Phòng 5', '25/09/2026 – 24/10/2026', '2.800.000 ₫', 'quá hạn 12 ngày', `/q/${token}`]) expect(copied).toContain(fact);
  expect(copied).not.toContain('!');

  const zalo = sheet.getByTestId('reminder-zalo');
  await expect(zalo).toHaveAttribute('href', 'https://zalo.me/0901111005');
  await expect(zalo).toHaveAttribute('target', '_blank');
  await expect(zalo).toHaveText('Mở Zalo');
  await expect(sheet.getByTestId('reminder-zalo-note')).toContainText('Giả định');
  await holdForRecording(page);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('reminder-390-light.png') });
});

test('the reminder’s link draws Phòng 5’s code signed out, and an unknown or malformed token answers 404', async ({ page }) => {
  await open(page, 'me.lane6@demo.esta.test', 'light', PHONE);
  const { token, memoCode } = await stored(page, laneInvoice(6, 'di-an', 5, '2026-09-25'));
  const outsider = await playwrightRequest.newContext({ baseURL: origin() });
  try {
    const response = await outsider.get(`/q/${token}`, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(decodeQrPng(await response.body())?.decoded).toEqual({
      ok: true,
      value: { initiation: 'dynamic', bin: '970436', accountNo: '0123456789', service: 'QRIBFTTA', amountVnd: 2_800_000, purpose: `ESTA ${memoCode}` },
    });
    for (const path of ['/q/AAAAAAAAAAAAAAAAAAAAAA', '/q/not-a-token', `/q/${token}x`]) expect((await outsider.get(path, { maxRedirects: 0 })).status()).toBe(404);
  } finally {
    await outsider.dispose();
  }
});

test('Phòng 3, not yet due, reads its due date with no overdue wording, addressed as chị in dark', async ({ page }) => {
  await open(page, 'me.lane6@demo.esta.test', 'dark', PHONE);
  const { token } = await stored(page, laneInvoice(6, 'di-an', 3, '2026-10-25'));
  await page.goto('/collections');
  await boardRow(page, 'notDue', 'Phòng 3, Dãy trọ Dĩ An').getByTestId('row-action-remind').click();
  const sheet = page.getByTestId('reminder-sheet');
  await sheet.getByText('Chị', { exact: true }).click();
  const expected = draftReminder({
    timing: { situation: 'due_soon' },
    form: 'chi',
    tenantName: 'Lê Văn Cường Demo',
    place: 'Phòng 3, Dãy trọ Dĩ An',
    periodStart: isoDate('2026-10-25'),
    periodEnd: isoDate('2026-11-24'),
    dueDate: isoDate('2026-10-25'),
    amountVnd: money(2_500_000),
    qrUrl: `${origin()}/q/${token}`,
  });
  await expect(sheet.getByTestId('reminder-text')).toHaveText(expected);
  await sheet.getByTestId('reminder-copy').click();
  await expect(sheet.getByTestId('reminder-copy-status')).toContainText('Đã sao chép');
  const copied = await clipboard(page);
  expect(copied).toBe(expected);
  expect(copied).toContain('hạn ngày 25/10/2026');
  expect(copied).not.toMatch(/quá hạn|sớm/);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('reminder-390-dark.png') });
});

test('a tenant with no phone gets a disabled Mở Zalo with Chưa có số điện thoại, copying still works, and voiding the bill kills its link', async ({ page }) => {
  await open(page, 'me.lane6@demo.esta.test', 'light', PHONE);
  const [tenant] = await memberRest<{ id: string }[]>(page, 'POST', 'parties', { household_id: laneHousehold(6), kind: 'individual', full_name: 'Lý Demo Thị Mai', tags: ['tenant'] });
  const lease = await freshLease(page, 6, { start: '2026-09-01', end: '2027-08-31', rent: 3_000_000, paidThrough: '2026-09-30', tenantPartyId: tenant?.id ?? '' });
  const [october] = await memberRest<{ id: string; share_token: string }[]>(page, 'GET', `invoices?lease_id=eq.${lease.id}&status=eq.issued&select=id,share_token`);
  await page.goto('/collections');
  await boardRow(page, 'overdue', `${lease.label}, Dãy trọ Dĩ An`).getByTestId('row-action-remind').click();
  const sheet = page.getByTestId('reminder-sheet');
  await expect(sheet.getByTestId('reminder-zalo')).toBeDisabled();
  await expect(sheet.getByTestId('reminder-zalo')).toHaveAccessibleDescription('Chưa có số điện thoại');
  await expect(sheet.getByTestId('reminder-zalo-note')).toHaveCount(0);
  await sheet.getByTestId('reminder-copy').click();
  const copied = await clipboard(page);
  expect(copied.split('\n')[0]).toBe('Chào anh/chị Mai.');
  expect(copied).toContain('quá hạn 6 ngày');
  expect(await seriousAxeViolations(page)).toEqual([]);

  const outsider = await playwrightRequest.newContext({ baseURL: origin() });
  try {
    expect((await outsider.get(`/q/${october?.share_token ?? ''}`)).status()).toBe(200);
    await memberRest(page, 'POST', 'rpc/void_invoice', { p_invoice_id: october?.id, p_reason: 'Hóa đơn Demo lập nhầm' });
    expect((await outsider.get(`/q/${october?.share_token ?? ''}`)).status()).toBe(404);
  } finally {
    await outsider.dispose();
  }
});

test('in English at 130% text on a wide screen the sheet is English and the copied reminder stays Vietnamese', async ({ page }) => {
  await open(page, 'ryan.lane9@demo.esta.test', 'dark', DESKTOP);
  const { token } = await stored(page, laneInvoice(9, 'di-an', 5, '2026-09-25'));
  await inEnglishAt130(page, seedId('seed:member:ryan-lane-9'), async () => {
    await page.goto('/collections');
    await boardRow(page, 'overdue', 'Phòng 5, Dãy trọ Dĩ An').getByTestId('row-action-remind').click();
    const sheet = page.getByTestId('reminder-sheet');
    await expect(sheet.getByTestId('reminder-copy')).toHaveText('Copy reminder');
    await expect(sheet.getByTestId('reminder-zalo')).toHaveText('Open Zalo');
    await expect(sheet.getByRole('group', { name: 'Form of address' })).toBeVisible();
    await sheet.getByTestId('reminder-copy').click();
    await expect(sheet.getByTestId('reminder-copy-status')).toContainText('Copied');
    expect(await clipboard(page)).toBe(draftReminder(phong5(token)));
    for (const id of ['reminder-copy', 'reminder-zalo']) {
      const box = await sheet.getByTestId(id).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(DESKTOP.width);
    }
    const cut = await sheet.locator('p, button, a, label').evaluateAll((elements) => elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.textContent));
    expect(cut).toEqual([]);
    expect(await seriousAxeViolations(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('reminder-1440-dark-en.png') });
  });
});
