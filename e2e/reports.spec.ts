import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import readXlsxFile from 'read-excel-file/node';
import { memberRest as rest } from './helpers/auth-api';
import { readReportTable } from './helpers/report-table';
import { laneHousehold, laneLease, laneProperty } from './helpers/seed';
import { frozenAtStart } from './helpers/test-clock';
import { DESKTOP, noSidewaysScroll, open, PHONE, seriousAxeViolations } from './helpers/wizard';

// The rent roll and the year's reports read the Clock, so the spec runs in the `clock` project.
frozenAtStart();

const report = (page: Page) => page.getByTestId('report');
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

async function axe(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(0, 0);
  return seriousAxeViolations(page);
}

test('lane 1: Ryan opens Báo cáo, and each property P&L income for 2026 is the sum of its allocation_facts (FIN-4)', async ({ page }) => {
  await open(page, 'ryan.lane1@demo.esta.test', 'light', DESKTOP);
  await page.locator('aside').getByRole('link', { name: 'Báo cáo' }).click();
  await expect(report(page).getByRole('heading', { name: 'Lãi lỗ theo tài sản năm 2026' })).toBeVisible();
  await expect(page.getByTestId('report-picker').getByRole('link')).toHaveText(['Thuế', 'Lãi lỗ theo tài sản', 'Danh sách thuê', 'Thu tiền theo tháng']);
  const table = await readReportTable(report(page));
  const facts = await rest<{ property_id: string; amount_vnd: number }[]>(
    page,
    'GET',
    `allocation_facts?household_id=eq.${laneHousehold(1)}&received_on=gte.2026-01-01&received_on=lte.2026-12-31&select=property_id,amount_vnd`,
  );
  for (const row of table.rows) {
    expect(row.amounts.income, row.cells['#0']).toBe(sum(facts.filter((fact) => fact.property_id === row.key).map((fact) => fact.amount_vnd)));
  }
  expect(table.rows.find((row) => row.key === laneProperty(1, 'di-an'))?.amounts.income, 'the seed received rent at Dĩ An').toBeGreaterThan(0);
  for (const id of Object.keys(table.totals.amounts)) expect(table.totals.amounts[id], `${id} total`).toBe(sum(table.rows.map((row) => row.amounts[id] ?? 0)));
  expect(await axe(page)).toEqual([]);

  await page.getByTestId('report-picker').getByRole('link', { name: 'Thuế' }).click();
  await expect(page).toHaveURL(/\/reports\/tax$/);
  await expect(page.getByTestId('report-picker').getByRole('link', { name: 'Thuế' })).toHaveAttribute('aria-current', 'page');
});

test('lane 2: Mẹ reads the rent roll on her phone: the leases in effect today, never Phòng 7, and Thủ Đức ends 01/11/2026', async ({ page }) => {
  await open(page, 'me.lane2@demo.esta.test', 'light', PHONE);
  await page.goto('/reports');
  await page.getByTestId('report-picker').getByRole('link', { name: 'Danh sách thuê' }).click();
  await expect(report(page).getByRole('heading', { name: 'Danh sách thuê ngày 07/10/2026' })).toBeVisible();
  const table = await readReportTable(report(page));
  const active = await rest<{ id: string }[]>(
    page,
    'GET',
    `leases?household_id=eq.${laneHousehold(2)}&status=eq.active&start_date=lte.2026-10-07&or=(end_date.is.null,end_date.gte.2026-10-07)&select=id`,
  );
  expect(table.rows.map((row) => row.key).toSorted()).toEqual(active.map((lease) => lease.id).toSorted());
  expect(table.rows.map((row) => row.cells['#0'])).not.toContain('Phòng 7, Dãy trọ Dĩ An');
  expect(table.rows.map((row) => row.key)).not.toContain(laneLease(2, 'di-an', 7));
  expect(table.rows.find((row) => row.key === laneLease(2, 'thu-duc', 1))?.cells.endDate).toBe('01/11/2026');
  for (const id of Object.keys(table.totals.amounts)) expect(table.totals.amounts[id], `${id} total`).toBe(sum(table.rows.map((row) => row.amounts[id] ?? 0)));
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await axe(page)).toEqual([]);
});

test("lane 3: October's collections equal what was allocated to October's bills, and Phòng 5's September bill is still owed", async ({ page }) => {
  await open(page, 'ryan.lane3@demo.esta.test', 'dark', DESKTOP);
  await page.goto('/reports?report=collections');
  await expect(report(page).getByRole('heading', { name: 'Thu tiền theo tháng năm 2026' })).toBeVisible();
  const table = await readReportTable(report(page));
  const due = (from: string, to: string) =>
    rest<{ lease_id: string; total_vnd: number; allocated_vnd: number; outstanding_vnd: number }[]>(
      page,
      'GET',
      `invoice_balances?household_id=eq.${laneHousehold(3)}&status=eq.issued&due_date=gte.${from}&due_date=lte.${to}&select=lease_id,total_vnd,allocated_vnd,outstanding_vnd`,
    );
  const october = await due('2026-10-01', '2026-10-31');
  const row = (key: string) => table.rows.find((candidate) => candidate.key === key)?.amounts;
  expect(row('2026-10')?.collected, 'October collected').toBe(sum(october.map((bill) => bill.allocated_vnd)));
  expect(row('2026-10')?.billed, 'October billed').toBe(sum(october.map((bill) => bill.total_vnd)));
  const september = await due('2026-09-01', '2026-09-30');
  const room5 = september.find((bill) => bill.lease_id === laneLease(3, 'di-an', 5));
  expect(room5?.outstanding_vnd, "Phòng 5's September bill is unpaid").toBeGreaterThan(0);
  expect(row('2026-09')?.outstanding, 'September outstanding').toBe(sum(september.map((bill) => bill.outstanding_vnd)));
  expect(row('2026-09')?.outstanding).toBeGreaterThanOrEqual(room5?.outstanding_vnd ?? Infinity);
  for (const id of Object.keys(table.totals.amounts)) expect(table.totals.amounts[id], `${id} total`).toBe(sum(table.rows.map((line) => line.amounts[id] ?? 0)));
  expect(await axe(page)).toEqual([]);
});

test('lane 6: the P&L Excel download has the screen header and the screen totals row', async ({ page }) => {
  await open(page, 'ryan.lane6@demo.esta.test', 'dark', DESKTOP);
  await page.goto('/reports');
  const table = await readReportTable(report(page));
  const [download] = await Promise.all([page.waitForEvent('download'), report(page).getByRole('link', { name: 'Tải Excel' }).click()]);
  expect(download.suggestedFilename()).toBe('lai-lo-2026.xlsx');
  const [sheet] = await readXlsxFile(await readFile(await download.path()));
  const rows = sheet?.data ?? [];
  expect(rows[0], 'the header row').toEqual(table.columns);
  expect(rows).toHaveLength(table.rows.length + 2);
  expect(rows.at(-1), 'the totals row').toEqual(['Tổng cộng', ...table.ids.map((id) => table.totals.amounts[id])]);
});
