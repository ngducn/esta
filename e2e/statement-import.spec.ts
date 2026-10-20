import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { golden, statementCsv, statementXlsx } from '../fixtures/statements/household.ts';
import { renderCsv } from '../packages/core/src/matching/render.ts';
import { query } from '../scripts/db-checksum.ts';
import { parseSlot, slotWorkdir } from '../scripts/slot.ts';
import { inEnglishAt130, memberRest } from './helpers/auth-api';
import { boardRow, storedInvoice } from './helpers/board';
import { laneHousehold, laneInvoice } from './helpers/seed';
import { chooseFile, expectGolden, laneStatement, line, preview, PROPERTY, secondAccount, statementHousehold, statementPayments, upload } from './helpers/statements';
import { setClock } from './helpers/test-clock';
import { DESKTOP, noSidewaysScroll, open, openNewHousehold, PHONE, recordForPr, seriousAxeViolations, shot, START, toast, vnd } from './helpers/wizard';

const holdForRecording = recordForPr();
const workdir = slotWorkdir(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));

// Bills issue on activation and a line may post only on or before the database clock's date, so the spec runs in the
// `clock` project at 07/10/2026. Each rule signs up a household of its own and fills it through the member's API.
test.beforeEach(async ({ request }) => {
  await setClock(request, START);
});

test('rule 1: Ryan imports the October statement, three memo matches post on Ghi sổ, he confirms the suggestion, and a re-import posts nothing (LSE-8)', async ({ page }) => {
  await openNewHousehold(page, 'light', PHONE);
  const household = await statementHousehold(page);
  const csv = statementCsv(household.statement, 'a');

  await page.goto('/collections');
  await page.getByTestId('statement-import-link').click();
  await expect(page).toHaveURL(/\/collections\/import$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nhập sao kê');
  await upload(page, 'sao-ke-thang-10.csv', csv);
  await expect(page.getByTestId('statement-read')).toContainText('sao-ke-thang-10.csv: đọc được 12 dòng.');
  await expect(page.getByTestId('statement-read')).toContainText('1 dòng không đọc được');
  await holdForRecording(page);
  await page.getByTestId('statement-preview').click();
  await expect(page).toHaveURL(/\/collections\/import\/[0-9a-f-]{36}$/, { timeout: 20_000 });

  await expect(page.getByTestId('statement-filter-memo_match')).toHaveText('Khớp mã (3)');
  await expect(page.getByTestId('statement-filter-suggested')).toHaveText('Gợi ý (1)');
  await expect(page.getByTestId('statement-filter-unmatched')).toHaveText('Chưa khớp (5)');
  await expect(page.getByTestId('statement-filter-ignored')).toHaveText('Bỏ qua (3)');
  await expect(page.getByTestId('statement-filter-posted')).toHaveText('Đã ghi sổ (0)');
  await expectGolden(page, household);
  await expect(line(page, 6).getByTestId('statement-target')).toContainText(' hoặc ');
  await expect(line(page, 6).getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByTestId('statement-refused')).toContainText('Dòng 13: số tiền có phần lẻ đồng, nên không ghi sổ');
  const memoTotal = household.statement.lines.slice(0, 3).reduce((sum, row) => sum + row.amount, 0);
  await expect(page.getByTestId('statement-summary')).toHaveText(`Sẽ ghi sổ 3 khoản, tổng ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(memoTotal)}.`);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page)).toBe(true);
  await shot(page, 'p3-15-preview-390-light');
  await holdForRecording(page);

  await page.getByTestId('statement-commit').click();
  await expect(page.getByTestId('statement-result')).toHaveText('Đã ghi sổ 3 khoản. Các khoản đã vào trang Thu tiền.');
  await expect(page.getByTestId('statement-filter-posted')).toHaveText('Đã ghi sổ (3)');
  await expect(page.getByTestId('statement-commit')).toHaveText('Ghi sổ 0 khoản');
  await expect(page.getByTestId('statement-commit')).toBeDisabled();
  await holdForRecording(page);

  await line(page, 4).getByRole('checkbox', { name: 'Xác nhận gợi ý dòng 4' }).click();
  await expect(page.getByTestId('statement-commit')).toHaveText('Ghi sổ 1 khoản');
  await page.getByTestId('statement-commit').click();
  await expect(page.getByTestId('statement-result')).toHaveText('Đã ghi sổ 1 khoản. Các khoản đã vào trang Thu tiền.');
  await expect(page.getByTestId('statement-filter-posted')).toHaveText('Đã ghi sổ (4)');
  await expect(page.getByTestId('statement-committed')).toHaveText('Đã ghi sổ sao kê này.');
  await shot(page, 'p3-15-posted-390-light');
  await holdForRecording(page);

  const payments = await statementPayments(page, household.householdId);
  expect(payments.map((payment) => payment.amount_vnd).toSorted()).toEqual(household.statement.lines.slice(0, 4).map((row) => row.amount as number).toSorted());
  expect(payments.every((payment) => payment.bank_account_id !== null && payment.statement_row_id !== null)).toBe(true);

  await page.goto('/collections');
  for (const expected of golden(household.statement).slice(0, 3)) {
    await expect(boardRow(page, 'paid', `${household.rooms.get(expected.invoices[0] ?? '')}, ${PROPERTY}`)).toBeVisible();
  }
  await shot(page, 'p3-15-board-after-390-light');
  await holdForRecording(page);

  for (const [name, bytes] of [
    ['sao-ke-thang-10.csv', csv],
    ['sao-ke-layout-c.csv', statementCsv(household.statement, 'c')],
    ['sao-ke-layout-b.xlsx', await statementXlsx(household.statement)],
  ] as const) {
    await upload(page, name, bytes);
    await page.getByTestId('statement-preview').click();
    await expect(page.getByTestId('statement-nothing-new')).toHaveText('Mọi dòng trong tệp này đã được nhập trước đây, nên không có gì mới để ghi sổ.');
  }
  await shot(page, 'p3-15-reimport-390-light');
  await holdForRecording(page);
  await page.getByTestId('statement-earlier').click();
  await expect(page.getByTestId('statement-filter-posted')).toHaveText('Đã ghi sổ (4)');
  expect(await statementPayments(page, household.householdId)).toHaveLength(4);
});

test('rule 2: at 1440 in dark, a layout B workbook into a second account previews with debits under Bỏ qua and posts into that account', async ({ page }) => {
  await openNewHousehold(page, 'dark', DESKTOP);
  const household = await statementHousehold(page);
  const second = await secondAccount(page, household.householdId);
  await page.goto('/collections/import');
  // The picker is disabled until React owns the page, so the account chosen here is the one the lines post into.
  await expect(page.getByTestId('statement-account')).toBeEnabled();
  await page.getByTestId('statement-account').selectOption(second);
  await chooseFile(page, 'sao-ke.xlsx', await statementXlsx(household.statement));
  await expect(page.getByTestId('statement-read')).toBeVisible();
  await page.getByTestId('statement-preview').click();
  await expect(page).toHaveURL(/\/collections\/import\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expectGolden(page, household);
  await expect(line(page, 7).getByTestId('statement-status')).toHaveText('Bỏ qua');
  await expect(line(page, 7).getByTestId('statement-target')).toHaveText('Tiền ra khỏi tài khoản');
  await shot(page, 'p3-15-preview-1440-dark');
  await page.getByTestId('statement-filter-suggested').click();
  await expect(page.getByTestId('statement-line')).toHaveCount(1);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page)).toBe(true);
  await page.getByTestId('statement-commit').click();
  await expect(page.getByTestId('statement-result')).toHaveText('Đã ghi sổ 3 khoản. Các khoản đã vào trang Thu tiền.');
  expect((await statementPayments(page, household.householdId)).map((payment) => payment.bank_account_id)).toEqual([second, second, second]);
});

test('rule 3: in English at 130% on a phone in dark, the preview reads in English and keeps amounts on one line', async ({ page }) => {
  await openNewHousehold(page, 'dark', PHONE);
  const household = await statementHousehold(page);
  const [member] = await memberRest<{ id: string }[]>(page, 'GET', `household_members?household_id=eq.${household.householdId}&select=id`);
  await preview(page, 'statement.csv', statementCsv(household.statement, 'c'));
  await inEnglishAt130(page, member?.id ?? '', async () => {
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Statement preview');
    await expect(page.getByTestId('statement-filter-memo_match')).toHaveText('Code match (3)');
    await expect(page.getByTestId('statement-commit')).toHaveText('Record 3 payments');
    const wrapped = await page.getByTestId('statement-amount').evaluateAll((amounts) => amounts.filter((amount) => amount.getBoundingClientRect().height > 40).length);
    expect(wrapped).toBe(0);
    expect(await noSidewaysScroll(page)).toBe(true);
    await shot(page, 'p3-15-english-130-390-dark');
    expect(await seriousAxeViolations(page)).toEqual([]);
  });
});

test('rule 4: a file that is not CSV or XLSX is refused with the reason, one without a known header opens the mapping, and nothing is stored', async ({ page }) => {
  await openNewHousehold(page, 'light', PHONE);
  const household = await statementHousehold(page);
  await page.goto('/collections/import');
  await chooseFile(page, 'ghi-chu.csv', 'Tên,Ghi chú\nAn,Demo\n');
  await expect(page.getByTestId('column-mapping')).toBeVisible();
  await expect(page.locator('#mapping-problem')).toHaveText('Chọn cột ngày, nội dung và số tiền để xem thử.');
  await expect(page.getByTestId('statement-preview')).toBeDisabled();
  await chooseFile(page, 'sao-ke.pdf', '%PDF-1.7');
  await expect(page.locator('#statement-file-message')).toHaveText('Chỉ nhận tệp CSV hoặc XLSX.');
  await expect(page.getByTestId('column-mapping')).toHaveCount(0);
  await chooseFile(page, 'trong.csv', 'Ngày,Nội dung,Số tiền\n');
  await expect(page.locator('#statement-file-message')).toHaveText('Tệp không có dòng giao dịch nào đọc được.');
  expect(await memberRest<unknown[]>(page, 'GET', `statement_imports?household_id=eq.${household.householdId}&select=id`)).toEqual([]);
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 5: offline, Ghi sổ keeps the ticked suggestion and says to try again; back online it posts', async ({ page }) => {
  await openNewHousehold(page, 'light', PHONE);
  const household = await statementHousehold(page);
  await preview(page, 'sao-ke.csv', statementCsv(household.statement, 'a'));
  await line(page, 4).getByRole('checkbox').click();
  await expect(page.getByTestId('statement-commit')).toHaveText('Ghi sổ 4 khoản');
  await page.context().setOffline(true);
  await page.getByTestId('statement-commit').click();
  await expect(page.locator('#statement-commit-error')).toHaveText('Chưa gửi được. Kiểm tra kết nối mạng rồi thử lại.');
  await expect(line(page, 4).getByRole('checkbox')).toBeChecked();
  await shot(page, 'p3-15-offline-390-light');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await page.context().setOffline(false);
  await page.getByTestId('statement-commit').click();
  await expect(page.getByTestId('statement-result')).toHaveText('Đã ghi sổ 4 khoản. Các khoản đã vào trang Thu tiền.');
  expect(await statementPayments(page, household.householdId)).toHaveLength(4);
});

test('rule 6: a viewer sees no Nhập sao kê and cannot open the import screen', async ({ page }) => {
  const admin = await openNewHousehold(page, 'light', PHONE);
  const household = await statementHousehold(page);
  const invited = `viewer.${admin.split('@')[0]}@demo.esta.test`;
  await memberRest(page, 'POST', 'household_members', { household_id: household.householdId, invited_email: invited, role: 'viewer' });
  await page.context().clearCookies();
  await open(page, invited, 'light', PHONE);
  await page.goto('/collections');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Thu tiền');
  await expect(page.getByTestId('statement-import-link')).toHaveCount(0);
  await page.goto('/collections/import');
  await expect(page.getByTestId('statement-admin-only')).toHaveText('Chỉ quản trị viên của gia đình mới nhập được sao kê ngân hàng.');
  await expect(page.getByTestId('statement-upload')).toHaveCount(0);
  await shot(page, 'p3-15-viewer-390-light');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 7: with no receiving account the import screen says where to add one', async ({ page }) => {
  await openNewHousehold(page, 'light', PHONE);
  await page.goto('/collections');
  await page.getByTestId('statement-import-link').click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Chưa có tài khoản nhận tiền');
  await expect(page.getByRole('link', { name: 'Về Thu tiền' })).toHaveAttribute('href', '/collections');
  await expect(page.getByTestId('statement-upload')).toHaveCount(0);
  await shot(page, 'p3-15-no-account-390-light');
  expect(await seriousAxeViolations(page)).toEqual([]);
});

test('rule 8: a code match on a bill Mẹ already recorded by hand is held, and Đã ghi tay links it without adding money', async ({ page }) => {
  await openNewHousehold(page, 'light', PHONE);
  const household = await statementHousehold(page);
  const [first] = household.statement.lines;
  const bill = household.bills.find((candidate) => candidate.number === golden(household.statement)[0]?.invoices[0]);
  if (first === undefined || bill === undefined) throw new Error('The statement has no first memo line');
  await memberRest(page, 'POST', 'rpc/record_payment', {
    p_invoice_id: bill.id,
    p_owed_vnd: bill.outstanding,
    p_amount_vnd: first.amount,
    p_method: 'bank_transfer',
    p_received_on: first.date,
    p_idempotency_key: crypto.randomUUID(),
  });
  await preview(page, 'sao-ke.csv', statementCsv(household.statement, 'a'));
  await expect(line(page, 1)).toHaveAttribute('data-status', 'held');
  await expect(line(page, 1).getByTestId('statement-status')).toHaveText('Có thể trùng');
  await expect(line(page, 1).getByTestId('statement-target')).toContainText('Có 1 khoản chuyển khoản ghi tay cùng số tiền của hợp đồng này');
  await expect(line(page, 1).getByTestId('statement-hands').getByRole('radio')).toBeChecked();
  await expect(line(page, 1).getByTestId('statement-hands')).toContainText(bill.number);
  await expect(line(page, 1).getByRole('checkbox', { name: 'Ghi sổ dòng 1 như một khoản mới' })).not.toBeChecked();
  await expect(page.getByTestId('statement-summary')).toContainText('Sẽ ghi sổ 2 khoản');
  await expect(page.getByTestId('statement-filter-held')).toHaveText('Có thể trùng (1)');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await line(page, 1).scrollIntoViewIfNeeded();
  await shot(page, 'p3-15-held-390-light');
  await line(page, 1).getByTestId('statement-link').click();
  await expect(page.getByTestId('statement-result')).toHaveText('Đã nối dòng 1 với khoản ghi tay, không thêm tiền.');
  await expect(line(page, 1)).toHaveAttribute('data-status', 'posted');
  await expect(line(page, 1).getByTestId('statement-target')).toContainText('đã ghi tay trước đó');
  await page.getByTestId('statement-commit').click();
  await expect(page.getByTestId('statement-result')).toHaveText('Đã ghi sổ 2 khoản. Các khoản đã vào trang Thu tiền.');
  expect(await statementPayments(page, household.householdId)).toHaveLength(2);
  const hand = await memberRest<{ statement_row_id: string | null }[]>(page, 'GET', `payments?household_id=eq.${household.householdId}&source=eq.manual&select=statement_row_id`);
  expect(hand.map((payment) => payment.statement_row_id !== null)).toEqual([true]);
});

test('rule 9: a transfer Mẹ records from Phòng 5’s October row settles September, and the October line holds on it instead of posting twice', async ({ page }) => {
  await open(page, 'ryan.lane9@demo.esta.test', 'light', PHONE);
  const october = laneInvoice(9, 'di-an', 5, '2026-10-25');
  const { memo_code: code } = await storedInvoice(page, october);
  await page.goto('/collections');
  await boardRow(page, 'notDue', 'Phòng 5, Dãy trọ Dĩ An').getByTestId('row-action-record-payment').click();
  const sheet = page.getByTestId('record-payment-sheet');
  await sheet.getByRole('textbox', { name: 'Số tiền nhận' }).fill('2.800.000');
  await expect(sheet.getByTestId('payment-allocation').getByRole('listitem').first()).toContainText('Tháng 9');
  await sheet.getByRole('radio', { name: 'Chuyển khoản' }).click();
  await sheet.getByTestId('payment-save').click();
  await expect(toast(page)).toContainText(`Đã ghi nhận ${vnd('2.800.000')} từ Phòng 5.`);

  const csv = renderCsv([
    ['Ngày giao dịch', 'Số tham chiếu', 'Số tiền (VND)', 'Nội dung'],
    ['06/10/2026 00:00:00', `FT9${Date.now()}`, '2.800.000', `MBVCB.ESTA${code}.CT TU 0903123456 HOANG VAN EM DEMO`],
  ]);
  await preview(page, 'sao-ke-phong-5.csv', csv);
  await expect(line(page, 1)).toHaveAttribute('data-status', 'held');
  await expect(line(page, 1).getByTestId('statement-hands')).toContainText(`${vnd('2.800.000')} ngày 07/10/2026 · DIAN-202609-`);
  await expect(page.getByTestId('statement-commit')).toHaveText('Ghi sổ 0 khoản');
  await line(page, 1).getByTestId('statement-link').click();
  await expect(line(page, 1)).toHaveAttribute('data-status', 'posted');
  const [bill] = await memberRest<{ outstanding_vnd: number }[]>(page, 'GET', `invoice_balances?id=eq.${october}&select=outstanding_vnd`);
  expect(bill?.outstanding_vnd).toBe(2_800_000);

  // Lane 9 goes back to its seeded bills for the specs that read them.
  const [hand] = await memberRest<{ id: string }[]>(page, 'GET', `payments?source=eq.manual&statement_row_id=not.is.null&created_by=not.is.null&order=created_at.desc&limit=1&select=id`);
  await memberRest(page, 'POST', 'rpc/undo_payment', { p_payment_id: hand?.id });
});

test('rule 10: on a seeded lane with September recorded by hand, the October statement posts its three code matches on Ghi sổ and Ryan confirms the suggestion (north-star step 5)', async ({ page }) => {
  const householdId = laneHousehold(6);
  await open(page, 'ryan.lane6@demo.esta.test', 'light', PHONE);
  const { statement, bills } = await laneStatement(page, 6, householdId);
  const expected = golden(statement);
  const matches = expected.filter((row) => row.status === 'memo_match');
  const suggestion = expected.find((row) => row.status === 'suggested');
  expect(matches).toHaveLength(3);
  if (suggestion === undefined) throw new Error('The lane statement has no suggestion');
  try {
    await page.goto('/collections');
    await page.getByTestId('statement-import-link').click();
    await expect(page).toHaveURL(/\/collections\/import$/);
    await chooseFile(page, 'sao-ke-thang-10.csv', statementCsv(statement, 'a'));
    await expect(page.getByTestId('statement-read')).toBeVisible();
    await page.getByTestId('statement-preview').click();
    await expect(page).toHaveURL(/\/collections\/import\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    for (const row of expected) await expect(line(page, row.index)).toHaveAttribute('data-status', row.status);
    await expect(page.getByTestId('statement-filter-held')).toHaveText('Có thể trùng (0)');
    await expect(page.getByTestId('statement-commit')).toHaveText('Ghi sổ 3 khoản');
    await page.getByTestId('statement-commit').click();
    await expect(page.getByTestId('statement-result')).toHaveText('Đã ghi sổ 3 khoản. Các khoản đã vào trang Thu tiền.');
    await line(page, suggestion.index).getByRole('checkbox', { name: `Xác nhận gợi ý dòng ${suggestion.index}` }).click();
    await page.getByTestId('statement-commit').click();
    await expect(page.getByTestId('statement-result')).toHaveText('Đã ghi sổ 1 khoản. Các khoản đã vào trang Thu tiền.');
    for (const row of [...matches, suggestion]) await expect(line(page, row.index)).toHaveAttribute('data-status', 'posted');

    const october = matches.map((row) => bills.find((bill) => bill.number === row.invoices[0])?.id);
    const rooms = await memberRest<{ lease: { unit: { label: string } } }[]>(
      page,
      'GET',
      `invoices?id=in.(${october.join(',')})&select=lease:leases!invoices_household_id_lease_id_fkey(unit:units!leases_household_id_property_id_unit_id_fkey(label))`,
    );
    await page.goto('/collections');
    for (const room of rooms) await expect(boardRow(page, 'paid', `${room.lease.unit.label}, Dãy trọ Dĩ An`)).toBeVisible();
  } finally {
    // Lane 6 goes back to its seeded bills for the specs that read them; nothing undoes an imported payment yet (#255).
    query(workdir, `delete from public.payments where household_id = '${householdId}' and source = 'statement_import' returning id`);
    query(workdir, `delete from public.statement_imports where household_id = '${householdId}' returning id`);
  }
});
