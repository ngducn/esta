import { expect, test, type Page } from '@playwright/test';
import { golden, statementCsv, statementXlsx } from '../fixtures/statements/household.ts';
import { inEnglishAt130, memberRest } from './helpers/auth-api';
import { boardRow } from './helpers/board';
import { PROPERTY, statementHousehold, type StatementHousehold } from './helpers/statements';
import { setClock } from './helpers/test-clock';
import { DESKTOP, noSidewaysScroll, open, openNewHousehold, PHONE, recordForPr, seriousAxeViolations, START } from './helpers/wizard';

const holdForRecording = recordForPr();

// Bills issue on activation and a line may post only on or before the database clock's date, so the spec runs in the
// `clock` project at 07/10/2026. Each rule signs up a household of its own and fills it through the member's API.
test.beforeEach(async ({ request }) => {
  await setClock(request, START);
});

const line = (page: Page, index: number) => page.locator(`[data-testid="statement-line"][data-line="${index}"]`);

async function upload(page: Page, name: string, buffer: Buffer | string) {
  await page.goto('/collections/import');
  await page.getByTestId('statement-file').setInputFiles({ name, mimeType: name.endsWith('.csv') ? 'text/csv' : 'application/octet-stream', buffer: Buffer.from(buffer) });
  await expect(page.getByTestId('statement-read')).toBeVisible();
}

async function preview(page: Page, name: string, buffer: Buffer | string) {
  await upload(page, name, buffer);
  await page.getByTestId('statement-preview').click();
  await expect(page).toHaveURL(/\/collections\/import\/[0-9a-f-]{36}$/, { timeout: 20_000 });
}

/** Every line reads the status golden.json gives it, and names the bills it gives. */
async function expectGolden(page: Page, household: StatementHousehold) {
  for (const expected of golden(household.statement)) {
    const row = line(page, expected.index);
    await expect(row).toHaveAttribute('data-status', expected.status);
    for (const number of expected.invoices) await expect(row.getByTestId('statement-target')).toContainText(number);
  }
}

const statementPayments = (page: Page, householdId: string) =>
  memberRest<{ amount_vnd: number; bank_account_id: string | null; statement_row_id: string | null }[]>(
    page,
    'GET',
    `payments?household_id=eq.${householdId}&source=eq.statement_import&select=amount_vnd,bank_account_id,statement_row_id`,
  );

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
  await holdForRecording(page);

  await page.getByTestId('statement-commit').click();
  await expect(page.getByTestId('statement-result')).toHaveText('Đã ghi sổ 3 khoản. Các khoản đã vào trang Thu tiền.');
  await expect(page.getByTestId('statement-filter-posted')).toHaveText('Đã ghi sổ (3)');
  await expect(page.getByTestId('statement-commit')).toHaveText('Xác nhận 0 gợi ý');
  await expect(page.getByTestId('statement-commit')).toBeDisabled();
  await holdForRecording(page);

  await line(page, 4).getByRole('checkbox', { name: 'Xác nhận gợi ý dòng 4' }).click();
  await expect(page.getByTestId('statement-commit')).toHaveText('Xác nhận 1 gợi ý');
  await page.getByTestId('statement-commit').click();
  await expect(page.getByTestId('statement-result')).toHaveText('Đã ghi sổ 1 khoản. Các khoản đã vào trang Thu tiền.');
  await expect(page.getByTestId('statement-filter-posted')).toHaveText('Đã ghi sổ (4)');
  await expect(page.getByTestId('statement-committed')).toHaveText('Đã ghi sổ sao kê này.');
  await holdForRecording(page);

  const payments = await statementPayments(page, household.householdId);
  expect(payments.map((payment) => payment.amount_vnd).toSorted()).toEqual(household.statement.lines.slice(0, 4).map((row) => row.amount as number).toSorted());
  expect(payments.every((payment) => payment.bank_account_id !== null && payment.statement_row_id !== null)).toBe(true);

  await page.goto('/collections');
  for (const expected of golden(household.statement).slice(0, 3)) {
    await expect(boardRow(page, 'paid', `${household.rooms.get(expected.invoices[0] ?? '')}, ${PROPERTY}`)).toBeVisible();
  }
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
  await holdForRecording(page);
  await page.getByTestId('statement-earlier').click();
  await expect(page.getByTestId('statement-filter-posted')).toHaveText('Đã ghi sổ (4)');
  expect(await statementPayments(page, household.householdId)).toHaveLength(4);
});

test('rule 2: at 1440 in dark, a layout B workbook previews with debits under Bỏ qua and nothing clipped', async ({ page }) => {
  await openNewHousehold(page, 'dark', DESKTOP);
  const household = await statementHousehold(page);
  await preview(page, 'sao-ke.xlsx', await statementXlsx(household.statement));
  await expectGolden(page, household);
  await expect(line(page, 7).getByTestId('statement-status')).toHaveText('Bỏ qua');
  await expect(line(page, 7).getByTestId('statement-target')).toHaveText('Tiền ra khỏi tài khoản');
  await page.getByTestId('statement-filter-suggested').click();
  await expect(page.getByTestId('statement-line')).toHaveCount(1);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('rule 3: in English at 130% on a phone, the preview reads in English and keeps amounts on one line', async ({ page }) => {
  await openNewHousehold(page, 'light', PHONE);
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
    expect(await seriousAxeViolations(page)).toEqual([]);
  });
});

test('rule 4: a file without a statement header, or not CSV or XLSX, is refused with the reason and nothing is stored', async ({ page }) => {
  await openNewHousehold(page, 'light', PHONE);
  const household = await statementHousehold(page);
  await page.goto('/collections/import');
  await page.getByTestId('statement-file').setInputFiles({ name: 'ghi-chu.csv', mimeType: 'text/csv', buffer: Buffer.from('Tên,Ghi chú\nAn,Demo\n') });
  await expect(page.locator('#statement-file-message')).toContainText('Không tìm thấy dòng tiêu đề có Ngày, Nội dung và Số tiền');
  await expect(page.getByTestId('statement-preview')).toBeDisabled();
  await page.getByTestId('statement-file').setInputFiles({ name: 'sao-ke.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') });
  await expect(page.locator('#statement-file-message')).toHaveText('Chỉ nhận tệp CSV hoặc XLSX.');
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
  expect(await seriousAxeViolations(page)).toEqual([]);
});
