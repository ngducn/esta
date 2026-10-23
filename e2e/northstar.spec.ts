import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { statementFromTemplate } from '../fixtures/statements/template.ts';
import { isoDate } from '../packages/core/src/date/iso-date.ts';
import { vnd as asVnd } from '../packages/core/src/money/vnd.ts';
import { draftReminder } from '../packages/core/src/reminder/templates.ts';
import { decodeQrPng } from '../scripts/decode-qr.ts';
import { startAgentWorker, type AgentWorker } from './helpers/agent-worker';
import { memberRest } from './helpers/auth-api';
import { boardRow } from './helpers/board';
import { signIn } from './helpers/inbucket';
import { chooseFromBoard, commitLines, confirmSuggestion, expectFilters, line, openPreview } from './helpers/statements';
import { cardVnd, expectedTaxPosition } from './helpers/tax';
import { setClock } from './helpers/test-clock';
import { acceptEvery, editField, fixture, followReadyNotice, open, PHONE, recordForPr, serviceGet, shot, START, startWizard, step, toast, vnd } from './helpers/wizard';

// SPEC §1.2 on the `northstar` seed, which has no Dãy trọ Dĩ An; `pnpm e2e:northstar` resets to it and runs this file.
test.describe.configure({ mode: 'serial', timeout: 180_000 });
test.skip(process.env.ESTA_NORTHSTAR !== '1', 'runs through pnpm e2e:northstar, on the northstar seed');
const holdForRecording = recordForPr();

const ME = 'me.lane1@demo.esta.test';
const RYAN = 'ryan.lane1@demo.esta.test';
const STEPS_1_AND_2_BUDGET_MS = 90_000;
const REVIEW_READY_BUDGET_MS = 10_000;
const PROPERTY = 'Dãy trọ Dĩ An';

/** Step 3's six tenants, one a room, each moved in months ago; rents and deposits as Mẹ types them. */
const ROOMS = [
  { label: 'Phòng 1', tenant: 'Nguyễn Văn An Demo', phone: '0901 111 001', start: '01/03/2026', rent: '2tr5', rentVnd: 2_500_000 },
  { label: 'Phòng 2', tenant: 'Trần Thị Bình Demo', phone: '0901 111 002', start: '15/04/2026', rent: '2tr8', rentVnd: 2_800_000 },
  { label: 'Phòng 3', tenant: 'Lê Văn Cường Demo', phone: '0901 111 003', start: '01/05/2026', rent: '2tr5', rentVnd: 2_500_000, end: '07/11/2026' },
  { label: 'Phòng 4', tenant: 'Võ Thị Dung Demo', phone: '0901 111 004', start: '01/06/2026', rent: '2tr8', rentVnd: 2_800_000 },
  { label: 'Phòng 5', tenant: 'Hoàng Văn Em Demo', phone: '0901 111 005', start: '10/02/2026', rent: '2tr5', rentVnd: 2_500_000 },
  { label: 'Phòng 6', tenant: 'Đặng Thị Giang Demo', phone: '0901 111 006', start: '01/07/2026', rent: '2tr8', rentVnd: 2_800_000 },
] as const;
const STATEMENT_TEMPLATE = readFileSync(join(import.meta.dirname, '..', 'fixtures', 'statements', 'northstar-template.csv'), 'utf8');

type Bill = { id: string; number: string; memo_code: string; period_start: string; period_end: string; due_date: string; share_token: string | null; lease: { unit: { label: string }; tenant: { full_name: string } } };

type Truth = { parcels: { parcel_no: { value: string }; map_sheet_no: { value: string }; area_m2: { value: number }; purposes: { land_use_code: { value: string } }[] }[] };

let worker: AgentWorker | undefined;
/** What each step hands the next: Dĩ An from step 2, its October bills in room order from step 4. */
let diAn = '';
let october: Bill[] = [];

test.afterAll(async ({ request }) => {
  await worker?.stop();
  await setClock(request, null);
});

test('steps 1 and 2: Mẹ signs in with the emailed code and adds Dãy trọ Dĩ An from its sổ hồng (FND-1, PRP-7, DOC-6)', async ({ page, request }) => {
  await setClock(request, START);
  worker = await startAgentWorker();
  const started = Date.now();
  const truth = fixture('northstar-di-an').truth as Truth;
  const [parcel] = truth.parcels;

  await test.step('1. Mẹ signs in on her phone with a 6-digit email code', async () => {
    await page.setViewportSize(PHONE);
    await page.context().addCookies([{ name: 'esta_theme', value: 'light', url: test.info().project.use.baseURL ?? '' }]);
    await signIn(page, ME);
    await expect(page).not.toHaveURL(/\/sign-in/);
  });

  const { propertyId, documentId } = await test.step('2. She adds Dãy trọ Dĩ An by photographing its sổ hồng, corrects one field and saves', async () => {
    // The three page photos go up as the one PDF the capture flow makes of them, the file its recording was made from.
    let uploadedAt = 0;
    const ids = await startWizard(page, {
      nickname: 'Dãy trọ Dĩ An',
      kind: 'rooming_house',
      photo: await fixture('northstar-di-an').upload(),
      beforeStart: async () => {
        uploadedAt = Date.now();
      },
    });
    expect(ids.documentId, 'the certificate was uploaded with the property').not.toBeNull();
    await expect
      .poll(async () => (await serviceGet<{ status: string }[]>(page, `document_status?document_id=eq.${ids.documentId}&select=status`))[0]?.status, {
        timeout: REVIEW_READY_BUDGET_MS,
        intervals: [250],
        message: `review ready within ${REVIEW_READY_BUDGET_MS / 1000} s of the upload in replay`,
      })
      .toBe('needs_review');
    console.log(`[perf] review ready ${Date.now() - uploadedAt} ms after the upload`);

    await page.getByTestId('skip-step').click();
    await step(page, 'owners');
    await followReadyNotice(page);
    await acceptEvery(page);
    await editField(page, 'parcels[0].area_m2', String(parcel?.area_m2.value).replace('.', ','));
    await page.getByTestId('review-submit').click();

    const confirm = page.getByTestId('address-confirm');
    await expect(confirm).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('certificate-address-text')).toContainText('tỉnh Bình Dương');
    await confirm.locator('[data-commune="25942"]').click();
    await expect(page.getByTestId('address-saved')).toContainText('Phường Dĩ An');
    await page.getByTestId('review-continue').click();
    await step(page, 'owners');
    await expect(page.getByTestId('owner-draft')).toHaveCount(1);
    await page.getByTestId('save-ownership').click();
    await step(page, 'use');
    await page.getByTestId('save-use').click();
    await step(page, 'finish');
    await expect(page.getByTestId('wizard-score')).toBeVisible();
    return ids;
  });
  diAn = propertyId;

  const elapsed = Date.now() - started;
  console.log(`[perf] north-star steps 1 and 2 in ${elapsed} ms`);
  expect(elapsed, `north-star steps 1 and 2 within ${STEPS_1_AND_2_BUDGET_MS / 1000} s`).toBeLessThanOrEqual(STEPS_1_AND_2_BUDGET_MS);

  await page.getByTestId('wizard-open-property').click();
  await expect(page).toHaveURL(`/properties/${propertyId}`);
  const addresses = page.getByTestId('property-addresses');
  await expect(addresses.locator('[data-line="legal"] dt')).toHaveText('Theo sổ');
  await expect(addresses.locator('[data-line="legal"] dd')).toContainText('tỉnh Bình Dương');
  await expect(addresses.locator('[data-line="current"] dt')).toHaveText('Hiện nay');
  // Thành phố Hồ Chí Minh (79) shows as `TP. Hồ Chí Minh`, the short form DOMAIN-VN §4 uses on every address line.
  await expect(addresses.locator('[data-line="current"] dd')).toContainText('Phường Dĩ An, TP. Hồ Chí Minh');
  await shot(page, 'p2-08-northstar-header-390x844-light');

  const [property] = await serviceGet<{ current_address: { commune_code: string; province_code: string } }[]>(page, `properties?id=eq.${propertyId}&select=current_address`);
  expect(property?.current_address).toMatchObject({ commune_code: '25942', province_code: '79' });
  const parcels = await serviceGet<{ parcel_no: string; map_sheet_no: string; area_m2: number; purposes: { land_use_code: string }[] }[]>(
    page,
    `parcels?property_id=eq.${propertyId}&select=parcel_no,map_sheet_no,area_m2,purposes`,
  );
  expect(parcels).toEqual([
    {
      parcel_no: parcel?.parcel_no.value,
      map_sheet_no: parcel?.map_sheet_no.value,
      area_m2: parcel?.area_m2.value,
      purposes: parcel?.purposes.map((purpose) => expect.objectContaining({ land_use_code: purpose.land_use_code.value })),
    },
  ]);
  const [extraction] = await serviceGet<{ status: string; accepted_fields: Record<string, { decision: string }> }[]>(
    page,
    `document_extractions?document_id=eq.${documentId}&select=status,accepted_fields`,
  );
  expect(extraction?.status).toBe('accepted');
  expect(extraction?.accepted_fields['parcels[0].area_m2']?.decision, 'Mẹ corrected the area').toBe('edited');
});

const rental = () => `/properties/${diAn}/rental`;
const unitRow = (page: Page, label: string) => page.getByTestId('unit-row').filter({ has: page.getByRole('heading', { name: label, exact: true }) });
const place = (label: string) => `${label}, ${PROPERTY}`;

async function addLease(page: Page, room: (typeof ROOMS)[number]) {
  await page.goto(rental());
  await unitRow(page, room.label).getByTestId('add-lease').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Hợp đồng mới cho ${room.label}`);
  await expect(page.getByTestId('form-loading')).toHaveCount(0);
  await page.getByTestId('add-tenant').click();
  await page.locator('#tenant-name').fill(room.tenant);
  await page.locator('#tenant-phone').fill(room.phone);
  await page.getByTestId('save-tenant').click();
  await expect(page.getByTestId('lease-tenant').locator('option:checked')).toHaveText(`${room.tenant} · ${room.phone}`);
  await page.getByRole('textbox', { name: 'Ngày bắt đầu' }).fill(room.start);
  if ('end' in room) await page.getByRole('textbox', { name: 'Ngày kết thúc' }).fill(room.end);
  await page.getByRole('textbox', { name: 'Tiền thuê mỗi tháng' }).fill(room.rent);
  await page.getByRole('textbox', { name: 'Tiền cọc' }).fill(room.rent);
  await page.getByTestId('lease-more').locator('summary').click();
  await page.getByTestId('lease-anchor').selectOption({ label: 'Tháng dương lịch' });
  await page.getByTestId('activate-lease').click();
  const dialog = page.getByTestId('activate-dialog');
  await dialog.getByRole('textbox', { name: 'Đã thu tiền đến hết ngày' }).fill('30/09/2026');
  await expect(dialog.getByTestId('preview-bill').first()).toContainText(`Kỳ 01/10/2026 – 31/10/2026Phát hành ngay · hạn thu 01/10/2026${vnd(new Intl.NumberFormat('vi-VN').format(room.rentVnd))}`);
  await expect(dialog.getByTestId('confirm-activate')).toBeEnabled();
  await dialog.getByTestId('confirm-activate').click();
  await expect(toast(page)).toContainText('Đã kích hoạt hợp đồng. Hóa đơn tháng 10 đã phát hành.');
  await expect(page.getByTestId('lease-status')).toHaveText('Đang thuê');
}

test('step 3: 8 rooms and 6 active monthly leases with deposits, paid through 30/09/2026, one ending 07/11/2026 (LSE-1, LSE-2)', async ({ page, request }) => {
  await setClock(request, START);
  const started = Date.now();
  await open(page, ME, 'light', PHONE);
  await page.goto(rental());
  await page.getByTestId('add-rooms').click();
  const sheet = page.getByTestId('add-rooms-sheet');
  await sheet.locator('#room-count').fill('8');
  await expect(sheet.getByTestId('room-labels')).toHaveText(`Sẽ thêm ${Array.from({ length: 8 }, (_, i) => `Phòng ${i + 1}`).join(', ')}`);
  await sheet.getByRole('textbox', { name: 'Giá niêm yết mỗi phòng' }).fill('2tr5');
  await sheet.getByTestId('save-rooms').click();
  await expect(sheet).toHaveCount(0);
  for (const room of ROOMS) await addLease(page, room);

  await page.goto(rental());
  for (const room of ROOMS) {
    await expect(unitRow(page, room.label).getByTestId('unit-tenant')).toHaveText(room.tenant);
    await expect(unitRow(page, room.label).locator('[data-status="overdue"]')).toHaveText('Quá hạn 6 ngày');
  }
  for (const label of ['Phòng 7', 'Phòng 8']) {
    await expect(unitRow(page, label).getByTestId('add-lease')).toHaveText('Thêm hợp đồng');
    await expect(unitRow(page, label).locator('[data-status="vacant"]')).toHaveText('Phòng trống');
  }
  await expect(page.locator('[data-status="paid"]').filter({ hasText: 'Đang cho thuê 6/8' })).toBeVisible();
  await shot(page, 'p3-17-northstar-step3-390-light');
  await holdForRecording(page);
  // The tab names a lease's end once it is terminated (P3-08); the contracted end reads on the lease's own page.
  await unitRow(page, 'Phòng 3').getByTestId('open-lease').click();
  await expect(page.getByTestId('lease-period')).toContainText('01/05/2026 đến 07/11/2026');
  await expect(page.getByTestId('lease-deposit')).toContainText(vnd('2.500.000'));

  const leases = await memberRest<{ status: string; anchor: string; deposit_vnd: number; rent_vnd: number; paid_through_date: string; end_date: string | null }[]>(
    page,
    'GET',
    `leases?property_id=eq.${diAn}&select=status,anchor:period_anchor,deposit_vnd,rent_vnd,paid_through_date,end_date&order=start_date`,
  );
  expect(leases).toHaveLength(6);
  for (const lease of leases) expect(lease).toMatchObject({ status: 'active', anchor: 'calendar_month', paid_through_date: '2026-09-30', deposit_vnd: lease.rent_vnd });
  expect(leases.filter((lease) => lease.end_date !== null).map((lease) => lease.end_date)).toEqual(['2026-11-07']);
  console.log(`[perf] north-star step 3 in ${Date.now() - started} ms`);
});

test('step 4: October bills for 01/10 to 31/10, due 01/10/2026, are issued for the 6 leases, each with a VietQR code and a receipt image (LSE-3, LSE-5, LSE-6)', async ({ page, request }) => {
  await setClock(request, START);
  const started = Date.now();
  await open(page, ME, 'light', PHONE);
  const leases = await memberRest<{ id: string }[]>(page, 'GET', `leases?property_id=eq.${diAn}&select=id`);
  const issued = await memberRest<Bill[]>(
    page,
    'GET',
    `invoices?lease_id=in.(${leases.map((lease) => lease.id).join(',')})&status=eq.issued&select=id,number,memo_code,period_start,period_end,due_date,share_token,lease:leases!invoices_household_id_lease_id_fkey(unit:units!leases_household_id_property_id_unit_id_fkey(label),tenant:parties!leases_household_id_tenant_party_id_fkey(full_name))`,
  );
  october = issued.toSorted((a, b) => a.lease.unit.label.localeCompare(b.lease.unit.label, 'vi', { numeric: true }));
  expect(october.map((bill) => [bill.lease.unit.label, bill.period_start, bill.period_end, bill.due_date])).toEqual(ROOMS.map((room) => [room.label, '2026-10-01', '2026-10-31', '2026-10-01']));

  await page.goto('/collections');
  await boardRow(page, 'overdue', place('Phòng 1')).getByTestId('row-action-qr').click();
  await page.getByTestId('qr-open-invoice').click();
  for (const [i, bill] of october.entries()) {
    const room = ROOMS[i];
    if (i > 0) await page.goto(`/collections/invoices/${bill.id}`);
    await expect(page).toHaveURL(`/collections/invoices/${bill.id}`);
    await expect(page.getByTestId('invoice-place')).toHaveText(place(room?.label ?? ''));
    await expect(page.getByTestId('invoice-period')).toHaveText('01/10/2026 đến 31/10/2026');
    await expect(page.getByTestId('invoice-due')).toHaveText('01/10/2026');
    const shown = decodeQrPng(await page.getByTestId('invoice-qr').getByTestId('qr-code').screenshot())?.decoded;
    expect(shown?.ok && shown.value).toMatchObject({ amountVnd: room?.rentVnd, purpose: `ESTA ${bill.memo_code}` });
    await expect(page.getByTestId('receipt-png')).toHaveText('Ảnh gửi Zalo');
    if (i === 0) {
      await shot(page, 'p3-17-northstar-step4-bill-390-light');
      await holdForRecording(page);
    }
    const receipt = await page.request.get(`/api/invoices/${bill.id}/receipt?format=png`);
    expect(receipt.status()).toBe(200);
    expect(receipt.headers()['content-type']).toBe('image/png');
    const bytes = await receipt.body();
    const png = PNG.sync.read(bytes);
    expect({ width: png.width, height: png.height }).toEqual({ width: 1080, height: 1527 });
    const pictured = decodeQrPng(bytes)?.decoded;
    expect(pictured?.ok && pictured.value).toMatchObject({ amountVnd: room?.rentVnd, purpose: `ESTA ${bill.memo_code}` });
  }
  console.log(`[perf] north-star step 4 in ${Date.now() - started} ms`);
});

test('step 5: Ryan imports the October statement, three lines post by memo code, he confirms the suggestion, and Mẹ records one cash payment (LSE-7, LSE-8)', async ({ page, request }) => {
  await setClock(request, START);
  const started = Date.now();
  await open(page, RYAN, 'light', PHONE);
  const csv = statementFromTemplate(
    STATEMENT_TEMPLATE,
    october.map((bill, i) => ({ memoCode: bill.memo_code, outstanding: asVnd(ROOMS[i]?.rentVnd ?? 0), tenantName: bill.lease.tenant.full_name })),
  );
  await chooseFromBoard(page, 'sao-ke-thang-10.csv', csv);
  await expect(page.getByTestId('statement-read')).toContainText('sao-ke-thang-10.csv: đọc được 7 dòng.');
  await openPreview(page);
  await expectFilters(page, { memo_match: 3, suggested: 1, unmatched: 1, ignored: 2 });
  for (const [index, status, room] of [[1, 'memo_match', 1], [2, 'memo_match', 2], [3, 'suggested', 4], [4, 'memo_match', 3], [5, 'unmatched', 0]] as const) {
    await expect(line(page, index)).toHaveAttribute('data-status', status);
    if (room > 0) await expect(line(page, index).getByTestId('statement-target')).toContainText(october[room - 1]?.number ?? '');
  }
  await shot(page, 'p3-17-northstar-step5-preview-390-light');
  await holdForRecording(page);
  await commitLines(page, 3);
  await confirmSuggestion(page, 3);
  await commitLines(page, 1);
  await expectFilters(page, { posted: 4 });
  await holdForRecording(page);

  await page.context().clearCookies();
  await open(page, ME, 'light', PHONE);
  await page.goto('/collections');
  await boardRow(page, 'overdue', place('Phòng 5')).getByTestId('row-action-record-payment').click();
  const sheet = page.getByTestId('record-payment-sheet');
  await expect(sheet.getByTestId('money-preview')).toHaveText(vnd('2.500.000'));
  await sheet.getByRole('radio', { name: 'Tiền mặt' }).click();
  await sheet.getByTestId('payment-save').click();
  await expect(toast(page)).toContainText(`Đã ghi nhận ${vnd('2.500.000')} từ Phòng 5.`);
  await holdForRecording(page);

  const balances = await memberRest<{ id: string; outstanding_vnd: number }[]>(page, 'GET', `invoice_balances?id=in.(${october.map((bill) => bill.id).join(',')})&select=id,outstanding_vnd`);
  expect(october.map((bill) => balances.find((balance) => balance.id === bill.id)?.outstanding_vnd)).toEqual([0, 0, 0, 0, 0, 2_800_000]);
  const payments = await memberRest<{ source: string; method: string }[]>(
    page,
    'GET',
    `payments?select=source,method,payment_allocations!inner(invoice_id)&payment_allocations.invoice_id=in.(${october.map((bill) => bill.id).join(',')})`,
  );
  expect(payments.map((payment) => `${payment.source} ${payment.method}`).toSorted()).toEqual(['manual cash', ...Array<string>(4).fill('statement_import bank_transfer')]);
  console.log(`[perf] north-star step 5 in ${Date.now() - started} ms`);
});

test('step 6: the October board shows Phòng 6 overdue 6 days and Mẹ copies its polite Vietnamese reminder for Zalo (LSE-10, LSE-11)', async ({ page, request }) => {
  await setClock(request, START);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, ME, 'light', PHONE);
  await page.goto('/collections');
  const overdue = page.getByTestId('group-overdue').getByTestId('collections-row').filter({ hasText: PROPERTY });
  await expect(overdue).toHaveCount(1);
  const phong6 = boardRow(page, 'overdue', place('Phòng 6'));
  await expect(phong6.locator('[data-status="overdue"]')).toHaveText('Quá hạn 6 ngày');
  for (const room of ROOMS.slice(0, 5)) await expect(boardRow(page, 'paid', place(room.label))).toBeVisible();
  await shot(page, 'p3-17-northstar-step6-board-390-light');
  await holdForRecording(page);

  await phong6.getByTestId('row-action-remind').click();
  const sheet = page.getByTestId('reminder-sheet');
  await sheet.getByTestId('reminder-copy').click();
  await expect(sheet.getByTestId('reminder-copy-status')).toHaveText('Đã sao chép. Mở Zalo rồi dán vào ô tin nhắn.');
  const bill = october[5];
  const [stored] = await memberRest<{ share_token: string | null }[]>(page, 'GET', `invoices?id=eq.${bill?.id}&select=share_token`);
  const expected = draftReminder({
    timing: { situation: 'overdue', days: 6 },
    form: 'anh_chi',
    tenantName: 'Đặng Thị Giang Demo',
    place: place('Phòng 6'),
    periodStart: isoDate('2026-10-01'),
    periodEnd: isoDate('2026-10-31'),
    dueDate: isoDate('2026-10-01'),
    amountVnd: asVnd(2_800_000),
    qrUrl: `${test.info().project.use.baseURL ?? ''}/q/${stored?.share_token ?? ''}`,
  });
  await expect(sheet.getByTestId('reminder-text')).toHaveText(expected);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  await expect(sheet.getByTestId('reminder-zalo')).toHaveAttribute('href', 'https://zalo.me/0901111006');
  await shot(page, 'p3-17-northstar-step6-reminder-390-light');
  await holdForRecording(page);
});

test.skip('step 7: the 2026-10-08 morning brief lists the overdue room, the ending lease and a market item (Phase 5, P5-10)', () => {});
test('step 8: the next morning Mẹ opens her tax card and reads her 2026 rent, with the six new leases, against 500 million VND (FIN-3)', async ({ page, request }) => {
  await setClock(request, '2026-10-08T07:05:00+07:00');
  await open(page, ME, 'light', PHONE);
  await page.goto('/reports/tax');
  const expected = await expectedTaxPosition(page, 'Nguyễn Thị Demo', 2026, '2026-10-08');
  await expect(page.getByTestId('tax-projected')).toHaveText(cardVnd(expected.projectedVnd));
  await expect(page.getByTestId('tax-threshold-rule')).toHaveAttribute('data-progress-bp', String(expected.progressBp));
  await expect(page.getByTestId('tax-progress')).toHaveText(
    expected.overThreshold ? `Vượt ngưỡng ${cardVnd(500_000_000)}` : `Đạt ${Math.floor(expected.progressBp / 100)}% ngưỡng ${cardVnd(500_000_000)}`,
  );
  await expect(page.getByTestId('tax-accrued')).toHaveText(`Đã ghi nhận đến 08/10/2026: ${cardVnd(expected.accruedVnd)}`);
  await expect(page.getByTestId('tax-vat')).toHaveText(cardVnd(expected.vatEstimateVnd));
  await expect(page.getByTestId('tax-pit')).toHaveText(cardVnd(expected.pitEstimateVnd));
  await expect(page.getByTestId('tax-lease').filter({ hasText: PROPERTY })).toHaveCount(ROOMS.length);
  await expect(page.getByTestId('tax-disclaimer').first()).toHaveText(/^Ước tính, không phải tư vấn thuế\. Nguồn: /);
  await shot(page, 'p4-04-northstar-step8-390-light');
  await holdForRecording(page);
});
test.skip('step 9: Ryan asks how much Dĩ An collected this month and gets the exact amount (Phase 5, P5-10)', () => {});
