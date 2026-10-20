import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { query } from '../scripts/db-checksum.ts';
import { decodeQrPng, type DecodedImage } from '../scripts/decode-qr.ts';
import { parseSlot, slotWorkdir } from '../scripts/slot.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { memberRest } from './helpers/auth-api';
import { boardRow, storedInvoice } from './helpers/board';
import { freshLease } from './helpers/leases';
import { laneHousehold, laneInvoice as invoiceId, laneLeasePath } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { DESKTOP, noSidewaysScroll, open, PHONE, recordForPr, seriousAxeViolations, settled, START, toast, vnd } from './helpers/wizard';

const holdForRecording = recordForPr();

// Overdue days and the board's month come from the Clock, so the spec runs in the `clock` project on SPEC §9.3's day.
test.beforeEach(async ({ request }) => {
  await setClock(request, START);
});

const workdir = slotWorkdir(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
const invoicePath = (id: string) => `/collections/invoices/${id}`;
const ACCOUNT = { bin: '970436', accountNo: '0123456789', accountName: 'NGUYEN THI DEMO', bankName: 'Vietcombank' } as const;


/** What a bank app's camera reads off the code as drawn on screen. */
async function scan(code: Locator): Promise<DecodedImage | null> {
  return decodeQrPng(await code.screenshot());
}

function expectInvoiceCode(image: DecodedImage | null, amountVnd: number | undefined, memoCode: string) {
  expect(image?.decoded).toEqual({
    ok: true,
    value: {
      initiation: amountVnd === undefined ? 'static' : 'dynamic',
      bin: ACCOUNT.bin,
      accountNo: ACCOUNT.accountNo,
      service: 'QRIBFTTA',
      ...(amountVnd === undefined ? {} : { amountVnd }),
      purpose: `ESTA ${memoCode}`,
    },
  });
}

async function expectFacts(panel: Locator, amount: string, memoCode: string) {
  await expect(panel.getByTestId('qr-amount')).toHaveText(vnd(amount));
  await expect(panel.getByTestId('qr-memo')).toHaveText(`ESTA ${memoCode}`);
  await expect(panel.getByTestId('qr-bank')).toHaveText(ACCOUNT.bankName);
  await expect(panel.getByTestId('qr-account-no')).toHaveText(ACCOUNT.accountNo);
  await expect(panel.getByTestId('qr-account-name')).toHaveText(ACCOUNT.accountName);
}

test('rule 1: Mã QR on Phòng 3 shows a code that scans to its amount, memo and account, and Lưu ảnh saves the same code', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  const id = invoiceId(1, 'di-an', 3, '2026-10-25');
  const { number, memo_code: memoCode } = await storedInvoice(page, id);
  await page.goto('/collections');
  const phong3 = boardRow(page, 'notDue', 'Phòng 3, Dãy trọ Dĩ An');
  await expect(phong3.getByRole('button')).toHaveText(['Ghi nhận', 'Mã QR', 'Nhắc qua Zalo']);
  await phong3.getByTestId('row-action-qr').click();
  const sheet = page.getByTestId('qr-sheet');
  await expect(sheet.getByRole('heading')).toHaveText('Phòng 3, Dãy trọ Dĩ An');
  await expect(sheet).toContainText(`Hóa đơn ${number}, hạn 25/10/2026`);
  await expectFacts(sheet, '2.500.000', memoCode);
  await expect(sheet.getByTestId('qr-split-note')).toHaveCount(0);
  const code = sheet.getByTestId('qr-code');
  expect((await code.boundingBox())?.width).toBeGreaterThanOrEqual(240);
  expectInvoiceCode(await scan(code), 2_500_000, memoCode);
  await holdForRecording(page);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('qr-sheet-390-light.png') });

  const [download] = await Promise.all([page.waitForEvent('download'), sheet.getByTestId('qr-save').click()]);
  expect(download.suggestedFilename()).toBe(`hoa-don-${number}.png`);
  const saved = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(saved);
  expectInvoiceCode(decodeQrPng(readFileSync(saved)), 2_500_000, memoCode);
});

test('rule 2: the bill lists its charges and totals beside the code, and prints on one A5 sheet without the app around it', async ({ page }) => {
  await open(page, 'ryan.lane2@demo.esta.test', 'dark', DESKTOP);
  const id = invoiceId(2, 'di-an', 3, '2026-10-25');
  const { number, memo_code: memoCode } = await storedInvoice(page, id);
  await page.goto('/collections');
  await boardRow(page, 'notDue', 'Phòng 3, Dãy trọ Dĩ An').getByTestId('row-action-qr').click();
  await page.getByTestId('qr-open-invoice').click();
  await expect(page).toHaveURL(invoicePath(id));
  await expect(page.getByTestId('invoice-place')).toHaveText('Phòng 3, Dãy trọ Dĩ An');
  await expect(page.getByTestId('invoice-number')).toHaveText(number);
  await expect(page.getByTestId('invoice-period')).toHaveText('25/10/2026 đến 24/11/2026');
  await expect(page.getByTestId('invoice-due')).toHaveText('25/10/2026');
  await expect(page.getByTestId('invoice-line')).toHaveCount(1);
  await expect(page.getByTestId('invoice-line')).toHaveAttribute('data-kind', 'rent');
  await expect(page.getByTestId('invoice-total')).toHaveText(vnd('2.500.000'));
  await expect(page.getByTestId('invoice-allocated')).toHaveText(vnd('0'));
  await expect(page.getByTestId('invoice-outstanding')).toHaveText(vnd('2.500.000'));
  const panel = page.getByTestId('invoice-qr');
  await expectFacts(panel, '2.500.000', memoCode);
  expectInvoiceCode(await scan(panel.getByTestId('qr-code')), 2_500_000, memoCode);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('bill-1440-dark.png'), fullPage: true });

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('aside')).toBeHidden();
  await expect(page.getByTestId('invoice-print')).toBeHidden();
  await expect(page.getByTestId('qr-save')).toBeHidden();
  await expect(page.getByTestId('invoice-lines')).toBeVisible();
  const color = (testId: string) => page.getByTestId(testId).evaluate((element) => getComputedStyle(element).color);
  expect(await color('invoice-place')).toBe(await color('invoice-number'));
  await page.screenshot({ path: test.info().outputPath('bill-print.png'), fullPage: true });
  const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
  expect(pdf.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1);
});

test('rule 3: from 500 million the code carries no amount, and the bill shows it in words and figures with the split note', async ({ page }) => {
  await open(page, 'me.lane3@demo.esta.test', 'light', PHONE);
  const id = invoiceId(3, 'di-an', 4, '2026-10-25');
  const { memo_code: memoCode } = await storedInvoice(page, id);
  const line = seedId('e2e:invoice-line:lane-3:cap');
  query(workdir, `insert into public.invoice_lines (id, household_id, invoice_id, kind, description, quantity, unit_price_vnd, amount_vnd, sort_order)
    select '${line}', i.household_id, i.id, 'adjustment', 'Điều chỉnh Demo', 1, 597500000, 597500000, 9 from public.invoices i where i.id = '${id}' returning id`);
  try {
    await page.goto(invoicePath(id));
    const panel = page.getByTestId('invoice-qr');
    await expect(page.getByTestId('invoice-outstanding')).toHaveText(vnd('600.000.000'));
    await expect(panel.getByTestId('qr-amount')).toHaveText(vnd('600.000.000'));
    await expect(panel.getByTestId('qr-amount-words')).toHaveText('Sáu trăm triệu đồng');
    await expect(panel.getByTestId('qr-split-note')).toHaveText(
      `Giả địnhSố tiền từ ${vnd('500.000.000')} trở lên. Mã QR không kèm số tiền, hãy chia thành nhiều lần chuyển.`,
    );
    expectInvoiceCode(await scan(panel.getByTestId('qr-code')), undefined, memoCode);
    expect(await seriousAxeViolations(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('bill-cap-390-light.png'), fullPage: true });
  } finally {
    query(workdir, `delete from public.invoice_lines where id = '${line}' returning id`);
  }
});

test('rule 4: a paid bill, a draft and a household without a receiving account show no code and say why; another household’s bill is not found', async ({ page }) => {
  await open(page, 'me.lane4@demo.esta.test', 'dark', PHONE);
  const noQr = page.getByTestId('invoice-no-qr');

  await page.goto(invoicePath(invoiceId(4, 'di-an', 3, '2026-09-25')));
  await expect(page.getByTestId('invoice-outstanding')).toHaveText(vnd('0'));
  await expect(noQr).toHaveAttribute('data-reason', 'paid');
  await expect(page.getByTestId('qr-code')).toHaveCount(0);

  await page.goto(invoicePath(invoiceId(4, 'thu-duc', 1, '2026-11-01')));
  await expect(page.getByTestId('invoice-status')).toHaveText('Bản nháp');
  await expect(noQr).toHaveText('Hóa đơn còn là bản nháp và sẽ phát hành ngày 01/11/2026. Mã QR có khi hóa đơn đã phát hành.');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('bill-draft-390-dark.png'), fullPage: true });

  const account = seedId('seed:bank-account:lane-4');
  query(workdir, `delete from public.bank_accounts where id = '${account}' returning id`);
  try {
    await page.goto(invoicePath(invoiceId(4, 'di-an', 3, '2026-10-25')));
    await expect(noQr).toHaveText('Chưa có tài khoản nhận tiền mặc định, nên chưa tạo được mã QR.');
    await page.goto('/collections');
    await expect(boardRow(page, 'notDue', 'Phòng 3, Dãy trọ Dĩ An').getByTestId('row-action-qr')).toHaveCount(0);
  } finally {
    query(workdir, `insert into public.bank_accounts (id, household_id, bank_bin, account_no, account_name, owner_party_id, is_default)
      values ('${account}', '${laneHousehold(4)}', '${ACCOUNT.bin}', '${ACCOUNT.accountNo}', '${ACCOUNT.accountName}', '${seedId('seed:party:me-lane-4')}', true) returning id`);
  }

  // The bill page streams behind its loading skeleton, so Next answers 200 and streams the not-found page with noindex.
  const other = invoiceId(5, 'di-an', 3, '2026-10-25');
  const [{ memo_code: otherMemo } = { memo_code: '' }] = query<{ memo_code: string }>(workdir, `select memo_code from public.invoices where id = '${other}'`);
  expect(otherMemo).not.toBe('');
  const response = await page.goto(invoicePath(other));
  await expect(page.getByTestId('invoice-not-found')).toBeVisible();
  await expect(page.getByTestId('invoice-not-found')).toContainText('Không tìm thấy hóa đơn này');
  await expect(page.getByTestId('invoice-place')).toHaveCount(0);
  const html = (await response?.text()) ?? '';
  expect(html).toContain('noindex');
  expect(html).not.toContain(otherMemo);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 5: the lease timeline links each bill, and Phòng 5’s overdue bill opens from there with its code', async ({ page }) => {
  await open(page, 'ryan.lane5@demo.esta.test', 'light', DESKTOP);
  const id = invoiceId(5, 'di-an', 5, '2026-09-25');
  const { number, memo_code: memoCode } = await storedInvoice(page, id);
  await page.goto(laneLeasePath(5, 'di-an', 5));
  await page.getByTestId('invoice-link').getByText(number, { exact: true }).click();
  await expect(page).toHaveURL(invoicePath(id));
  await expect(page.getByTestId('invoice-status')).toContainText('Quá hạn 12 ngày');
  expectInvoiceCode(await scan(page.getByTestId('invoice-qr').getByTestId('qr-code')), 2_800_000, memoCode);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('bill-overdue-1440-light.png'), fullPage: true });
});

test('rule 6: in English at 130% text the QR sheet keeps the code at least 240 px wide and every fact unclipped', async ({ page }) => {
  await open(page, 'me.lane6@demo.esta.test', 'dark', PHONE);
  const memberId = seedId('seed:member:me-lane-6');
  await memberRest(page, 'PATCH', `household_members?id=eq.${memberId}`, { locale: 'en', text_scale: 130 });
  try {
    const { memo_code: memoCode } = await storedInvoice(page, invoiceId(6, 'di-an', 5, '2026-09-25'));
    await page.goto('/collections');
    await boardRow(page, 'overdue', 'Phòng 5, Dãy trọ Dĩ An').getByTestId('row-action-qr').click();
    const sheet = page.getByTestId('qr-sheet');
    await expect(sheet.getByTestId('qr-save')).toHaveText('Save image');
    await expect(sheet.getByTestId('qr-memo')).toHaveText(`ESTA ${memoCode}`);
    const code = sheet.getByTestId('qr-code');
    expect((await code.boundingBox())?.width).toBeGreaterThanOrEqual(240);
    expectInvoiceCode(await scan(code), 2_800_000, memoCode);
    const clipped = await sheet.locator('dd').evaluateAll((facts) => facts.filter((fact) => fact.scrollWidth > fact.clientWidth).length);
    expect(clipped).toBe(0);
    expect(await noSidewaysScroll(page)).toBe(true);
    expect(await seriousAxeViolations(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('qr-sheet-en-130-390-dark.png') });
  } finally {
    await memberRest(page, 'PATCH', `household_members?id=eq.${memberId}`, { locale: 'vi', text_scale: 100 });
  }
});

/** The lease's bills by period start, as the member reads them. */
const billsOf = (page: Page, lease: string) => memberRest<{ id: string; number: string; period_start: string; status: string }[]>(page, 'GET', `invoices?lease_id=eq.${lease}&select=id,number,period_start,status&order=period_start`);

test('rule 7: Ryan voids a wrong October bill with a reason, nothing bills October again, and the lease it blocked then ends on 30/09', async ({ page }) => {
  await open(page, 'ryan.lane5@demo.esta.test', 'light', DESKTOP);
  const lease = await freshLease(page, 5, { start: '2026-09-01', end: '2027-08-31', rent: 3_000_000, paidThrough: '2026-09-30' });
  const [october] = (await billsOf(page, lease.id)).filter((bill) => bill.period_start === '2026-10-01');
  if (october === undefined) throw new Error('activation issued no October bill');

  await page.goto(lease.path);
  await page.getByTestId('lease-terminate').click();
  const ending = page.getByTestId('terminate-dialog');
  await ending.getByRole('textbox', { name: 'Ngày kết thúc' }).fill('30/09/2026');
  await ending.getByTestId('terminate-reason').fill('Demo: người thuê chuyển đi');
  await ending.getByTestId('terminate-confirm').click();
  const blocked = ending.getByTestId('terminate-blocked-by');
  await expect(blocked).toContainText(`Hóa đơn ${october.number} đã phát hành cho kỳ sau ngày này. Nếu lập nhầm, hãy hủy hóa đơn đó rồi kết thúc hợp đồng.`);
  await settled(ending.getByTestId('terminate-confirm'));
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('end-lease-blocked-1440-light.png') });
  await blocked.getByRole('link', { name: `Mở hóa đơn ${october.number}` }).click();
  await expect(page).toHaveURL(invoicePath(october.id));

  await page.getByTestId('invoice-void').click();
  const dialog = page.getByTestId('void-dialog');
  await expect(dialog.getByTestId('void-question')).toHaveText(`Hủy hóa đơn ${october.number}?`);
  await dialog.getByTestId('void-confirm').click();
  await expect(dialog).toContainText('Nhập lý do hủy.');
  await dialog.getByTestId('void-reason').fill('Demo: người thuê đã chuyển đi 30/09');
  await settled(dialog.getByTestId('void-confirm'));
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('void-dialog-1440-light.png') });
  await dialog.getByTestId('void-confirm').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('invoice-status')).toHaveText('Đã hủy');
  await expect(page.getByTestId('invoice-no-qr')).toHaveText('Hóa đơn đã hủy, nên không có mã QR. Lý do: Demo: người thuê đã chuyển đi 30/09');
  await expect(page.getByTestId('qr-code')).toHaveCount(0);
  await expect(page.getByTestId('invoice-void')).toHaveCount(0);
  await expect(page.getByTestId('invoice-total')).toHaveText(vnd('3.000.000'));
  await expect(page.getByTestId('invoice-outstanding'), 'a void bill owes nothing, so it shows no amount still owed').toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('bill-void-1440-light.png'), fullPage: true });

  query(workdir, `select * from public.run_invoicing('${laneHousehold(5)}', '2026-10-07', '2026-10-07T00:30:00+07:00')`);
  expect((await billsOf(page, lease.id)).filter((bill) => bill.period_start.startsWith('2026-10'))).toEqual([{ ...october, status: 'void' }]);

  await page.goto(lease.path);
  const row = page.getByTestId('lease-timeline').locator('li[data-period-start="2026-10-01"]');
  await expect(row).toHaveAttribute('data-mark', 'void');
  await expect(row.locator('[data-status="void"]')).toHaveText('Đã hủy');
  await page.getByTestId('lease-terminate').click();
  await ending.getByRole('textbox', { name: 'Ngày kết thúc' }).fill('30/09/2026');
  await ending.getByTestId('terminate-reason').fill('Demo: người thuê chuyển đi');
  await ending.getByTestId('terminate-confirm').click();
  await expect(toast(page)).toContainText(`Đã kết thúc hợp đồng ${lease.label} từ ngày 30/09/2026.`);
  await expect(page.getByTestId('lease-status')).toHaveText('Đã chấm dứt');
});

test('rule 8: Mẹ issues November’s draft early with Phát hành, and the bill then shows its code', async ({ page }) => {
  await open(page, 'me.lane4@demo.esta.test', 'dark', PHONE);
  const lease = await freshLease(page, 4, { start: '2026-09-01', end: '2027-08-31', rent: 3_000_000, paidThrough: '2026-10-31' });
  const [november] = await billsOf(page, lease.id);
  expect(november).toMatchObject({ period_start: '2026-11-01', status: 'draft' });
  await page.goto(invoicePath(november?.id ?? ''));
  await expect(page.getByTestId('invoice-status')).toHaveText('Bản nháp');
  await expect(page.getByTestId('invoice-void')).toHaveCount(0);
  await expect(page.getByTestId('invoice-issue')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('bill-draft-issue-390-dark.png') });
  await page.getByTestId('invoice-issue').click();
  await expect(page.getByTestId('invoice-status')).toHaveAttribute('data-status', 'issued');
  await expect(page.getByTestId('invoice-issue')).toHaveCount(0);
  await expect(page.getByTestId('invoice-void')).toBeVisible();
  const { memo_code: memoCode } = await storedInvoice(page, november?.id ?? '');
  expectInvoiceCode(await scan(page.getByTestId('invoice-qr').getByTestId('qr-code')), 3_000_000, memoCode);
  expect(await memberRest(page, 'GET', `invoices?id=eq.${november?.id ?? ''}&select=status,issue_on`)).toEqual([{ status: 'issued', issue_on: '2026-10-07' }]);
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('bill-issued-390-dark.png'), fullPage: true });
});

test('rule 9: with no receiving account Mẹ adds one from the bill, its code pays into it, and a transfer on the board names it', async ({ page }) => {
  await open(page, 'me.lane8@demo.esta.test', 'light', PHONE);
  const seeded = seedId('seed:bank-account:lane-8');
  query(workdir, `delete from public.bank_accounts where id = '${seeded}' returning id`);
  try {
    const id = invoiceId(8, 'di-an', 3, '2026-10-25');
    const { memo_code: memoCode } = await storedInvoice(page, id);
    await page.goto(invoicePath(id));
    await expect(page.getByTestId('invoice-no-qr')).toHaveAttribute('data-reason', 'noAccount');
    await page.getByTestId('add-account').click();
    const sheet = page.getByTestId('account-sheet');
    await sheet.getByTestId('account-save').click();
    await expect(sheet).toContainText('Chọn ngân hàng.');
    await sheet.getByTestId('account-bank').selectOption(ACCOUNT.bin);
    await expect(sheet).not.toContainText('Chọn ngân hàng.');
    await sheet.getByTestId('account-no').fill('0071 000 123 456');
    await sheet.getByTestId('account-name').fill('Nguyễn Thị Demo');
    await expect(sheet.getByTestId('account-name-preview')).toHaveText('NGUYEN THI DEMO');
    expect(await noSidewaysScroll(page)).toBe(true);
    expect(await seriousAxeViolations(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('account-sheet-390-light.png') });
    await sheet.getByTestId('account-save').click();
    await expect(sheet).toBeHidden();
    const panel = page.getByTestId('invoice-qr');
    await expect(panel.getByTestId('qr-account-no')).toHaveText('0071000123456');
    await expect(panel.getByTestId('qr-account-name')).toHaveText('NGUYEN THI DEMO');
    expect((await scan(panel.getByTestId('qr-code')))?.decoded).toMatchObject({ ok: true, value: { bin: ACCOUNT.bin, accountNo: '0071000123456', purpose: `ESTA ${memoCode}` } });

    await page.goto('/collections');
    await boardRow(page, 'notDue', 'Phòng 3, Dãy trọ Dĩ An').getByTestId('row-action-record-payment').click();
    const payment = page.getByTestId('record-payment-sheet');
    await payment.getByRole('radio', { name: 'Chuyển khoản' }).click();
    await expect(payment.getByTestId('payment-account')).toHaveText('Vào tài khoản Vietcombank · 0071000123456');
    await payment.getByTestId('payment-save').click();
    await expect(payment).toBeHidden();
    const [added] = query<{ id: string }>(workdir, `select id::text as id from public.bank_accounts where household_id = '${laneHousehold(8)}' and account_no = '0071000123456'`);
    expect(query(workdir, `select method from public.payments where bank_account_id = '${added?.id ?? ''}'`)).toEqual([{ method: 'bank_transfer' }]);
  } finally {
    query(workdir, `delete from public.payments where bank_account_id in (select id from public.bank_accounts where household_id = '${laneHousehold(8)}') returning id`);
    query(workdir, `delete from public.bank_accounts where household_id = '${laneHousehold(8)}' returning id`);
    query(workdir, `insert into public.bank_accounts (id, household_id, bank_bin, account_no, account_name, owner_party_id, is_default)
      values ('${seeded}', '${laneHousehold(8)}', '${ACCOUNT.bin}', '${ACCOUNT.accountNo}', '${ACCOUNT.accountName}', '${seedId('seed:party:me-lane-8')}', true) returning id`);
  }
});
