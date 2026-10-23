import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import readXlsxFile from 'read-excel-file/node';
import { memberRest as rest } from './helpers/auth-api';
import { readReportTable } from './helpers/report-table';
import { laneProperty } from './helpers/seed';
import { DESKTOP, noSidewaysScroll, open, PHONE, recordForPr, seriousAxeViolations } from './helpers/wizard';

const pause = recordForPr();

const finance = (lane: number, key: string, query = '') => `/properties/${laneProperty(lane, key)}/finance${query}`;

const ledger = (page: Page) => page.getByTestId('ledger');

async function screenTable(page: Page) {
  const table = await readReportTable(ledger(page));
  return { columns: table.columns, ids: table.ids, months: table.rows.map((row) => ({ key: row.key, amounts: row.amounts })), totals: table.totals.amounts };
}

async function axe(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(0, 0);
  return seriousAxeViolations(page);
}

async function downloadExcel(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), ledger(page).getByRole('link', { name: 'Tải Excel' }).click()]);
  const [first] = await readXlsxFile(await readFile(await download.path()));
  return { name: download.suggestedFilename(), rows: first?.data ?? [] };
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

async function incomeSql(page: Page, propertyId: string, from: string, to: string) {
  const rows = await rest<{ amount_vnd: number }[]>(page, 'GET', `allocation_facts?property_id=eq.${propertyId}&received_on=gte.${from}&received_on=lte.${to}&select=amount_vnd`);
  return sum(rows.map((row) => row.amount_vnd));
}

test('Mẹ opens Dãy trọ Dĩ An Thu chi for 2026: October income is the database sum, and each net is income minus expenses (FIN-2)', async ({ page }) => {
  await open(page, 'me.lane1@demo.esta.test', 'light', PHONE);
  await page.goto(finance(1, 'di-an'));
  await pause(page);
  await expect(ledger(page).getByRole('heading', { name: 'Thu chi năm 2026' })).toBeVisible();
  const table = await screenTable(page);
  const october = table.months.find((month) => month.key === '2026-10');
  expect(october?.amounts.income, 'October income equals allocation_facts for di-an').toBe(await incomeSql(page, laneProperty(1, 'di-an'), '2026-10-01', '2026-10-31'));
  expect(october?.amounts.income, 'the seed received rent in October').toBeGreaterThan(0);
  for (const { key, amounts } of table.months) expect(amounts.noi, key).toBe((amounts.income ?? 0) - (amounts.expenses ?? 0));
  for (const id of table.ids) expect(table.totals[id], `${id} total is the sum of the months`).toBe(sum(table.months.map(({ amounts }) => amounts[id] ?? 0)));
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await axe(page)).toEqual([]);
  await pause(page);
  await ledger(page).locator('[data-key="2026-10"]').scrollIntoViewIfNeeded();
  await pause(page);
  const excel = await downloadExcel(page);
  expect(excel.name).toBe('DIAN-thu-chi-2026.xlsx');
  expect(excel.rows.at(-1), 'the phone download totals what the screen shows').toEqual(['Tổng cộng', ...table.ids.map((id) => table.totals[id])]);
  await pause(page);
});

test('a link to ?month=2026-10 opens that year with October marked and in view, and keeps the mark on reload', async ({ page }) => {
  await open(page, 'ryan.lane4@demo.esta.test', 'dark', DESKTOP);
  await page.goto(finance(4, 'di-an', '?month=2026-10'));
  const october = ledger(page).locator('[data-key="2026-10"]');
  await expect(october).toHaveAttribute('aria-current', 'date');
  await expect(october).toBeInViewport();
  await expect(ledger(page).locator('[aria-current="date"]')).toHaveCount(1);
  await page.reload();
  await expect(october).toHaveAttribute('aria-current', 'date');
});

test('Ryan downloads Nhà phố Q7 as Excel and CSV: both totals equal the screen totals, and Sửa chữa is the database sum', async ({ page }) => {
  await open(page, 'ryan.lane2@demo.esta.test', 'light', DESKTOP);
  await page.goto(finance(2, 'q7'));
  const table = await screenTable(page);
  const repairs = await rest<{ amount_vnd: number }[]>(
    page,
    'GET',
    `expenses?property_id=eq.${laneProperty(2, 'q7')}&category=eq.repair&deleted_at=is.null&paid_on=gte.2026-01-01&paid_on=lte.2026-12-31&select=amount_vnd`,
  );
  expect(table.totals.repair, 'Sửa chữa total').toBe(sum(repairs.map((row) => row.amount_vnd)));
  expect(table.totals.repair).toBeGreaterThan(0);

  const excel = await downloadExcel(page);
  expect(excel.name).toBe('Q7-thu-chi-2026.xlsx');
  expect(excel.rows[0], 'the header row').toEqual(table.columns);
  expect(excel.rows).toHaveLength(table.months.length + 2);
  expect(excel.rows.at(-1), 'the totals row').toEqual(['Tổng cộng', ...table.ids.map((id) => table.totals[id])]);

  const [csv] = await Promise.all([page.waitForEvent('download'), ledger(page).getByRole('link', { name: 'Tải CSV' }).click()]);
  expect(csv.suggestedFilename()).toBe('Q7-thu-chi-2026.csv');
  const text = await readFile(await csv.path(), 'utf8');
  expect(text.charCodeAt(0), 'UTF-8 byte order mark').toBe(0xfeff);
  const lines = text.slice(1).split('\r\n');
  expect(lines[0]).toBe(table.columns.join(','));
  expect(lines.at(-2), 'the totals line').toBe(['Tổng cộng', ...table.ids.map((id) => table.totals[id])].join(','));
  expect(await axe(page)).toEqual([]);
});

test('Đất vườn Long An has no income or expenses in 2026: no table, and Thêm chi phí is the action', async ({ page }) => {
  await open(page, 'me.lane8@demo.esta.test', 'dark', PHONE);
  await page.goto(finance(8, 'long-an'));
  await expect(ledger(page).getByTestId('ledger-empty')).toContainText('Chưa có khoản thu hay chi nào trong năm 2026.');
  await expect(ledger(page).getByRole('table')).toHaveCount(0);
  await expect(page.getByTestId('expense-section').getByRole('button', { name: 'Thêm chi phí' })).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test('2025 on Dãy trọ Dĩ An totals what the database received that year', async ({ page }) => {
  await open(page, 'ryan.lane9@demo.esta.test', 'light', DESKTOP);
  await page.goto(finance(9, 'di-an'));
  await ledger(page).getByRole('link', { name: '2025', exact: true }).click();
  await expect(ledger(page).getByRole('heading', { name: 'Thu chi năm 2025' })).toBeVisible();
  const table = await screenTable(page);
  expect(table.months).toHaveLength(12);
  expect(table.totals.income).toBe(await incomeSql(page, laneProperty(9, 'di-an'), '2025-01-01', '2025-12-31'));
  expect(table.totals.income, 'the seed received rent in 2025').toBeGreaterThan(0);
});
