import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import { vndInWords } from '../packages/core/src/format/words.ts';
import { vnd as asVnd } from '../packages/core/src/money/vnd.ts';
import { decodeQrPng } from '../scripts/decode-qr.ts';
import { pdfText } from '../scripts/receipt-text.ts';
import { seedId } from '../supabase/seed/generator/ids.ts';
import { inEnglishAt130, memberRest } from './helpers/auth-api';
import { laneInvoice } from './helpers/seed';
import { setClock } from './helpers/test-clock';
import { DESKTOP, noSidewaysScroll, open, PHONE, seriousAxeViolations, START } from './helpers/wizard';

// The receipt prints today's date from the Clock, so the spec runs in the `clock` project on SPEC §9.3's day.
test.beforeEach(async ({ request }) => {
  await setClock(request, START);
});

const A5 = { width: 419.528, height: 595.276 };
const receiptPath = (id: string, format: 'pdf' | 'png') => `/api/invoices/${id}/receipt?format=${format}`;

type Stored = { number: string; memo_code: string; lease: { tenant: { full_name: string } } };
type Balance = { total_vnd: number; allocated_vnd: number; outstanding_vnd: number };

async function stored(page: Page, id: string) {
  const [invoice] = await memberRest<Stored[]>(page, 'GET', `invoices?id=eq.${id}&select=number,memo_code,lease:leases!invoices_household_id_lease_id_fkey(tenant:parties!leases_household_id_tenant_party_id_fkey(full_name))`);
  const [balance] = await memberRest<Balance[]>(page, 'GET', `invoice_balances?id=eq.${id}&select=total_vnd,allocated_vnd,outstanding_vnd`);
  if (invoice === undefined || balance === undefined) throw new Error(`No invoice ${id}`);
  return { ...invoice, ...balance, tenant: invoice.lease.tenant.full_name };
}

/** The receipt as the member's browser fetches it, with her session cookie. */
async function receiptPdf(page: Page, id: string) {
  const response = await page.request.get(receiptPath(id, 'pdf'));
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('application/pdf');
  const bytes = await response.body();
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);
  const { width, height } = pdf.getPage(0).getSize();
  expect({ width, height }).toEqual(A5);
  return pdfText(bytes);
}

/** pdf.js reads the no-break space before ₫ back as a plain space. */
const amount = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;

test('rule 1: Thông báo PDF on the unpaid Phòng 3 October bill prints a notice with the tenant in NFC, the lines, the total and its words and no received row, and Ảnh gửi Zalo saves a 1080 × 1527 picture whose code pays the bill (LSE-6)', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  const id = laneInvoice(2, 'di-an', 3, '2026-10-25');
  const bill = await stored(page, id);
  expect(bill.allocated_vnd).toBe(0);
  await page.goto(`/collections/invoices/${id}`);
  const pdfLink = page.getByTestId('receipt-pdf');
  await expect(pdfLink).toHaveText('Thông báo PDF');
  await expect(page.getByTestId('receipt-png')).toHaveText('Ảnh gửi Zalo');
  await expect(pdfLink).toHaveAttribute('href', receiptPath(id, 'pdf'));
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('bill-receipt-links-390-light.png'), fullPage: true });

  const text = await receiptPdf(page, id);
  expect(bill.tenant).toBe(bill.tenant.normalize('NFC'));
  for (const expected of ['Thông báo tiền thuê', bill.tenant, bill.number, 'Phòng 3, Dãy trọ Dĩ An', 'Tiền thuê', amount(bill.total_vnd), vndInWords(asVnd(bill.total_vnd), 'vi'), `Còn lại\n${amount(bill.outstanding_vnd)}`, `ESTA ${bill.memo_code}`, 'Ngày lập 07/10/2026']) {
    expect(text).toContain(expected);
  }
  expect(text).not.toContain('Biên nhận');
  expect(text).not.toContain('Đã nhận');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('receipt-png').click()]);
  expect(download.suggestedFilename()).toBe(`thong-bao-${bill.number}.png`);
  const saved = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(saved);
  const bytes = readFileSync(saved);
  const png = PNG.sync.read(bytes);
  expect({ width: png.width, height: png.height }).toEqual({ width: 1080, height: 1527 });
  const decoded = decodeQrPng(bytes)?.decoded;
  expect(decoded?.ok && decoded.value).toMatchObject({ amountVnd: bill.outstanding_vnd, purpose: `ESTA ${bill.memo_code}` });
});

test('rule 2: once part of the October bill is received it prints Biên nhận tiền thuê, with the received row and the code for the rest', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  const id = laneInvoice(2, 'di-an', 3, '2026-10-25');
  const before = await stored(page, id);
  const [payment] = await memberRest<{ id: string }[]>(page, 'POST', 'rpc/record_payment', {
    p_invoice_id: id,
    p_invoice_ids: [id],
    p_owed_vnd: before.outstanding_vnd,
    p_amount_vnd: 1_000_000,
    p_method: 'cash',
    p_received_on: '2026-10-07',
    p_idempotency_key: crypto.randomUUID(),
  });
  try {
    const bill = await stored(page, id);
    expect(bill.allocated_vnd).toBe(1_000_000);
    await page.goto(`/collections/invoices/${id}`);
    await expect(page.getByTestId('receipt-pdf')).toHaveText('Biên nhận PDF');
    const text = await receiptPdf(page, id);
    for (const expected of ['Biên nhận tiền thuê', `Đã nhận\n${amount(1_000_000)}`, `Còn lại\n${amount(bill.outstanding_vnd)}`, `ESTA ${bill.memo_code}`]) expect(text).toContain(expected);
    expect(text).not.toContain('Thông báo');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('receipt-png').click()]);
    expect(download.suggestedFilename()).toBe(`bien-nhan-${bill.number}.png`);
    const decoded = decodeQrPng(readFileSync(await download.path()))?.decoded;
    expect(decoded?.ok && decoded.value).toMatchObject({ amountVnd: bill.outstanding_vnd, purpose: `ESTA ${bill.memo_code}` });
  } finally {
    if (payment !== undefined) await memberRest(page, 'POST', 'rpc/undo_payment', { p_payment_id: payment.id });
  }
});

test('rule 3: a paid September bill prints Biên nhận tiền thuê with the received amount equal to the total and no code', async ({ page }) => {
  await open(page, 'ryan.lane2@demo.esta.test', 'light', DESKTOP);
  const id = laneInvoice(2, 'di-an', 3, '2026-09-25');
  const bill = await stored(page, id);
  expect(bill.outstanding_vnd).toBe(0);
  const text = await receiptPdf(page, id);
  expect(text).toContain('Biên nhận tiền thuê');
  expect(text).toContain(`Đã nhận\n${amount(bill.total_vnd)}`);
  expect(text).toContain('Đã nhận đủ tiền kỳ này');
  expect(text).not.toContain(`ESTA ${bill.memo_code}`);
  const png = await page.request.get(receiptPath(id, 'png'));
  expect(png.headers()['content-type']).toBe('image/png');
  expect(png.headers()['content-disposition']).toBe(`inline; filename="bien-nhan-${bill.number}.png"`);
  expect(decodeQrPng(await png.body())).toBeNull();
});

test('rule 4: another household’s bill, a draft and a malformed id answer 404 with no receipt', async ({ page }) => {
  await open(page, 'me.lane8@demo.esta.test', 'dark', PHONE);
  for (const id of [laneInvoice(9, 'di-an', 3, '2026-10-25'), laneInvoice(8, 'thu-duc', 1, '2026-11-01'), 'not-a-bill']) {
    for (const format of ['pdf', 'png'] as const) {
      const response = await page.request.get(receiptPath(id, format));
      expect(response.status(), `${id} ${format}`).toBe(404);
      expect(response.headers()['content-type'] ?? '').not.toMatch(/pdf|png/);
    }
  }
});

test('rule 5: in English at 130% text the buttons read in English and the unpaid bill’s notice stays Vietnamese', async ({ page }) => {
  await open(page, 'me.lane10@demo.esta.test', 'dark', PHONE);
  await inEnglishAt130(page, seedId('seed:member:me-lane-10'), async () => {
    const id = laneInvoice(10, 'di-an', 5, '2026-09-25');
    await page.goto(`/collections/invoices/${id}`);
    await expect(page.getByTestId('receipt-pdf')).toHaveText('Notice PDF');
    await expect(page.getByTestId('receipt-png')).toHaveText('Picture for Zalo');
    expect(await noSidewaysScroll(page)).toBe(true);
    expect(await seriousAxeViolations(page)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('bill-receipt-links-en-130-390-dark.png'), fullPage: true });
    const text = await receiptPdf(page, id);
    expect(text).toContain('Thông báo tiền thuê');
    expect(text).toContain('Bằng chữ:');
    expect(text).not.toContain('Rent notice');
  });
});
