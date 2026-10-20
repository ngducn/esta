import { expect, test, type Page } from '@playwright/test';
import { statementCsv, unrecognizedCsv } from '../fixtures/statements/household.ts';
import { UNRECOGNIZED_COLUMNS, UNRECOGNIZED_LAYOUT } from '../packages/core/src/matching/statement-scenario.ts';
import { inEnglishAt130, memberRest } from './helpers/auth-api';
import { chooseFile, expectGolden, nextUnrecognizedCsv, openBills, secondAccount, statementHousehold, statementPayments, upload } from './helpers/statements';
import { setClock } from './helpers/test-clock';
import { DESKTOP, noSidewaysScroll, openNewHousehold, PHONE, recordForPr, seriousAxeViolations, shot, START } from './helpers/wizard';

const holdForRecording = recordForPr();

// P3-21: a statement from a bank Esta does not recognize opens the column mapping, and the columns Ryan picks read the
// account's next statement. It runs in the `clock` project at 07/10/2026 like statement-import.spec.ts, each rule in a
// household of its own.
test.beforeEach(async ({ request }) => {
  await setClock(request, START);
});

const mapping = (page: Page) => page.getByTestId('column-mapping');
const money = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
const dayOf = (date: string) => date.split('-').toReversed().join('/');
const { headerRow: HEADER_ROW } = UNRECOGNIZED_COLUMNS;
const LABELS = UNRECOGNIZED_LAYOUT.columns.map((column) => column.header);
const INTRO_NEW = 'Esta chưa biết mẫu sao kê của ngân hàng này. Chọn cột ngày, nội dung và số tiền một lần; lần sau nhập từ tài khoản này, Esta tự dùng lại các cột đã chọn.';

/** Ryan's picks for the bank Esta does not recognize: the date, its voucher number, the description, then money in and out. */
async function mapUnrecognized(page: Page, split = 'Hai cột: tiền vào và tiền ra') {
  await page.getByTestId('mapping-date').selectOption('0');
  await page.getByTestId('mapping-bank-ref').selectOption('1');
  await page.getByTestId('mapping-description').selectOption('2');
  await page.getByRole('radio', { name: split }).check();
  await page.getByTestId('mapping-credit').selectOption('3');
  await page.getByTestId('mapping-debit').selectOption('4');
}

async function toPreview(page: Page) {
  await page.getByTestId('statement-preview').click();
  await expect(page).toHaveURL(/\/collections\/import\/[0-9a-f-]{36}$/, { timeout: 20_000 });
}

test('rule 1: Ryan maps the columns of a statement Esta does not recognize and posts it, and the next statement from that account skips the mapping (LSE-8 preset)', async ({ page }) => {
  await openNewHousehold(page, 'light', PHONE);
  const household = await statementHousehold(page);
  const csv = unrecognizedCsv(household.statement);

  await page.goto('/collections');
  await page.getByTestId('statement-import-link').click();
  await expect(page).toHaveURL(/\/collections\/import$/);
  await chooseFile(page, 'sao-ke-ngan-hang-demo.csv', csv);
  await expect(mapping(page)).toBeVisible();
  await expect(page.getByTestId('mapping-intro')).toHaveText(INTRO_NEW);
  await expect(page.getByTestId('mapping-header-row')).toHaveValue(String(HEADER_ROW));
  await expect(page.getByTestId('mapping-header-row').locator('option:checked')).toContainText('Ngày thực hiện · Số chứng từ');
  await expect(page.locator('#mapping-problem')).toHaveText('Chọn cột ngày, nội dung và số tiền để xem thử.');
  await expect(page.getByTestId('statement-preview')).toBeDisabled();
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p3-21-mapping-new-390-light');
  await holdForRecording(page);

  await mapUnrecognized(page);
  const sample = household.statement.lines.slice(0, 5);
  await expect(page.getByTestId('mapping-sample-date')).toHaveText(sample.map((line) => dayOf(line.date)));
  await expect(page.getByTestId('mapping-sample-amount')).toHaveText(sample.map((line) => money(line.amount)));
  await expect(page.getByTestId('statement-read')).toContainText('sao-ke-ngan-hang-demo.csv: đọc được 12 dòng.');
  await expect(page.getByTestId('statement-read')).toContainText('1 dòng không đọc được');
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page)).toBe(true);
  await shot(page, 'p3-21-mapping-390-light');
  await holdForRecording(page);

  await toPreview(page);
  await expect(page.getByTestId('statement-filter-memo_match')).toHaveText('Khớp mã (3)');
  await expect(page.getByTestId('statement-filter-suggested')).toHaveText('Gợi ý (1)');
  // Lines are numbered from the header, so the bank's account lines above it shift nothing.
  await expectGolden(page, household);
  await expect(page.getByTestId('statement-refused')).toContainText('Dòng 13: số tiền có phần lẻ đồng, nên không ghi sổ');
  await shot(page, 'p3-21-preview-390-light');
  await holdForRecording(page);
  await page.getByTestId('statement-commit').click();
  await expect(page.getByTestId('statement-result')).toHaveText('Đã ghi sổ 3 khoản. Các khoản đã vào trang Thu tiền.');
  await holdForRecording(page);
  expect(await memberRest<{ column_mapping: unknown }[]>(page, 'GET', `statement_imports?household_id=eq.${household.householdId}&select=column_mapping`)).toEqual([
    { column_mapping: { ...UNRECOGNIZED_COLUMNS, header: LABELS, source: 'mapped' } },
  ]);

  // The rest of October's rent arrives on the account's next statement, which the saved columns read.
  const { bills } = await openBills(page, household.householdId);
  await page.goto('/collections/import');
  await chooseFile(page, 'sao-ke-ngan-hang-demo-2.csv', nextUnrecognizedCsv(bills, 'FT02'));
  await expect(page.getByTestId('statement-preset')).toContainText('Dùng cột đã chọn lần trước.');
  await expect(page.getByTestId('statement-read')).toContainText(`sao-ke-ngan-hang-demo-2.csv: đọc được ${bills.length} dòng.`);
  await expect(mapping(page)).toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p3-21-preset-390-light');
  await holdForRecording(page);
  await toPreview(page);
  await expect(page.getByTestId('statement-filter-memo_match')).toHaveText(`Khớp mã (${bills.length})`);
  await page.getByTestId('statement-commit').click();
  await expect(page.getByTestId('statement-result')).toHaveText(`Đã ghi sổ ${bills.length} khoản. Các khoản đã vào trang Thu tiền.`);
  await holdForRecording(page);

  // The first statement again, by its labels in layout A or under the saved columns, carries the same fingerprints.
  for (const [name, bytes] of [
    ['sao-ke-thang-10.csv', statementCsv(household.statement, 'a')],
    ['sao-ke-ngan-hang-demo.csv', csv],
  ] as const) {
    await upload(page, name, bytes);
    await page.getByTestId('statement-preview').click();
    await expect(page.getByTestId('statement-nothing-new')).toHaveText('Mọi dòng trong tệp này đã được nhập trước đây, nên không có gì mới để ghi sổ.');
  }
  expect(await statementPayments(page, household.householdId)).toHaveLength(3 + bills.length);
  expect(await memberRest<unknown[]>(page, 'GET', `statement_imports?household_id=eq.${household.householdId}&select=id`)).toHaveLength(2);
});

test('rule 2: a mapping that reads no line, such as the description picked as the amount, is refused before Xem trước and nothing is stored', async ({ page }) => {
  await openNewHousehold(page, 'light', PHONE);
  const household = await statementHousehold(page);
  await page.goto('/collections/import');
  await chooseFile(page, 'sao-ke-ngan-hang-demo.csv', unrecognizedCsv(household.statement));
  await page.getByTestId('mapping-date').selectOption('0');
  await page.getByTestId('mapping-description').selectOption('2');
  await page.getByTestId('mapping-amount').selectOption('2');
  await expect(page.locator('#mapping-problem')).toHaveText('Mỗi cột chỉ chọn cho một mục.');
  await page.getByTestId('mapping-description').selectOption('1');
  await expect(page.locator('#mapping-problem')).toHaveText('Không đọc được dòng nào với các cột này. Hãy kiểm tra cột ngày và cột số tiền.');
  await expect(page.getByTestId('mapping-sample-row')).toHaveCount(0);
  await expect(page.getByTestId('statement-preview')).toBeDisabled();
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page)).toBe(true);
  await shot(page, 'p3-21-refused-390-light');
  // A header row picked among the bank's account lines reads nothing either.
  await page.getByTestId('mapping-header-row').selectOption('1');
  await expect(page.locator('#mapping-problem')).toHaveText('Chọn cột ngày, nội dung và số tiền để xem thử.');
  await expect(page.getByTestId('statement-preview')).toBeDisabled();
  expect(await memberRest<unknown[]>(page, 'GET', `statement_imports?household_id=eq.${household.householdId}&select=id`)).toEqual([]);
});

test('rule 3: at 1440 in dark, saved columns belong to their account, Đổi cột reopens them, and a header the bank changed opens the mapping with the columns that kept their names', async ({ page }) => {
  await openNewHousehold(page, 'dark', DESKTOP);
  const household = await statementHousehold(page);
  const [first] = await memberRest<{ id: string }[]>(page, 'GET', `bank_accounts?household_id=eq.${household.householdId}&select=id`);
  const second = await secondAccount(page, household.householdId);
  await page.goto('/collections/import');
  await chooseFile(page, 'sao-ke-ngan-hang-demo.csv', unrecognizedCsv(household.statement));
  await mapUnrecognized(page);
  await expect(page.getByTestId('mapping-sample-row')).toHaveCount(5);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(await noSidewaysScroll(page)).toBe(true);
  await shot(page, 'p3-21-mapping-1440-dark');
  // Columns Ryan chose are saved with the import even before anything posts.
  await toPreview(page);

  const { bills } = await openBills(page, household.householdId);
  await page.goto('/collections/import');
  await chooseFile(page, 'sao-ke-ngan-hang-demo-2.csv', nextUnrecognizedCsv(bills, 'FT03'));
  await expect(page.getByTestId('statement-preset')).toBeVisible();
  await page.getByTestId('statement-account').selectOption(second);
  await expect(page.getByTestId('mapping-intro')).toHaveText(INTRO_NEW);
  await expect(page.getByTestId('statement-preview')).toBeDisabled();
  await page.getByTestId('statement-account').selectOption(first?.id ?? '');
  await expect(page.getByTestId('statement-preset')).toBeVisible();
  await expect(mapping(page)).toHaveCount(0);
  await page.getByTestId('statement-preset-change').click();
  await expect(page.getByTestId('mapping-intro')).toHaveText('Chọn lại các cột. Lần sau nhập từ tài khoản này, Esta dùng các cột mới.');
  await expect(page.getByTestId('mapping-credit')).toHaveValue('3');
  await expect(page.getByTestId('statement-preview')).toBeEnabled();

  const renamed = LABELS.map((label) => (label === 'Tiền gửi vào' ? 'Số tiền gửi vào' : label));
  await chooseFile(page, 'sao-ke-ngan-hang-demo-3.csv', nextUnrecognizedCsv(bills, 'FT04', renamed));
  await expect(page.getByTestId('mapping-intro')).toHaveText('Tên cột khác lần trước, nên cần chọn lại. Các cột còn giữ tên cũ đã được chọn sẵn.');
  for (const [role, column] of [
    ['date', '0'],
    ['bank-ref', '1'],
    ['description', '2'],
    ['credit', ''],
    ['debit', '4'],
  ] as const) {
    await expect(page.getByTestId(`mapping-${role}`)).toHaveValue(column);
  }
  await expect(page.getByRole('radio', { name: 'Hai cột: tiền vào và tiền ra' })).toBeChecked();
  await expect(page.locator('#mapping-problem')).toHaveText('Chọn cột ngày, nội dung và số tiền để xem thử.');
  expect(await seriousAxeViolations(page)).toEqual([]);
  await shot(page, 'p3-21-mismatch-1440-dark');
  await page.getByTestId('mapping-credit').selectOption('3');
  await expect(page.getByTestId('mapping-sample-row')).toHaveCount(5);
  await expect(page.getByTestId('statement-preview')).toBeEnabled();
});

test('rule 4: in English at 130% on a phone in dark, the mapping reads in English and its sample keeps amounts on one line', async ({ page }) => {
  await openNewHousehold(page, 'dark', PHONE);
  const household = await statementHousehold(page);
  const [member] = await memberRest<{ id: string }[]>(page, 'GET', `household_members?household_id=eq.${household.householdId}&select=id`);
  await inEnglishAt130(page, member?.id ?? '', async () => {
    await page.goto('/collections/import');
    await chooseFile(page, 'bank-statement.csv', unrecognizedCsv(household.statement));
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Choose this statement’s columns');
    await page.getByTestId('mapping-date').selectOption('0');
    await page.getByTestId('mapping-bank-ref').selectOption('1');
    await page.getByTestId('mapping-description').selectOption('2');
    await page.getByRole('radio', { name: 'Two columns: money in and money out' }).check();
    await page.getByTestId('mapping-credit').selectOption('3');
    await page.getByTestId('mapping-debit').selectOption('4');
    await expect(page.getByTestId('statement-read')).toContainText('bank-statement.csv: 12 lines read.');
    const wrapped = await page.getByTestId('mapping-sample-amount').evaluateAll((amounts) => amounts.filter((amount) => amount.getBoundingClientRect().height > 40).length);
    expect(wrapped).toBe(0);
    expect(await noSidewaysScroll(page)).toBe(true);
    await shot(page, 'p3-21-english-130-390-dark');
    expect(await seriousAxeViolations(page)).toEqual([]);
  });
});
