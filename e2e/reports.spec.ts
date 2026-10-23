import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import readXlsxFile from 'read-excel-file/node';
import { memberRest as rest } from './helpers/auth-api';
import { pdfText } from '../scripts/receipt-text.ts';
import { amountOf, readReportTable } from './helpers/report-table';
import { laneHousehold, laneLease, laneProperty } from './helpers/seed';
import { frozenAtStart } from './helpers/test-clock';
import { DESKTOP, noSidewaysScroll, open, PHONE, seriousAxeViolations } from './helpers/wizard';

// The rent roll and the year's reports read the Clock, so the spec runs in the `clock` project.
frozenAtStart();

const report = (page: Page) => page.getByTestId('report');
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

function expectAmountTotals(table: Awaited<ReturnType<typeof readReportTable>>) {
  for (const id of Object.keys(table.totals.amounts)) expect(table.totals.amounts[id], `${id} total`).toBe(sum(table.rows.map((row) => row.amounts[id] ?? 0)));
}

async function axe(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(0, 0);
  return seriousAxeViolations(page);
}

test('lane 1: Ryan opens Báo cáo, and each property P&L income for 2026 is the sum of its allocation_facts (FIN-4)', async ({ page }) => {
  await open(page, 'ryan.lane1@demo.esta.test', 'light', DESKTOP);
  await page.locator('aside').getByRole('link', { name: 'Báo cáo' }).click();
  await expect(report(page).getByRole('heading', { name: 'Lãi lỗ theo tài sản năm 2026' })).toBeVisible();
  await expect(page.getByTestId('report-picker').getByRole('link')).toHaveText([
    'Thuế',
    'Lãi lỗ theo tài sản',
    'Theo chủ sở hữu',
    'Danh sách thuê',
    'Thu tiền theo tháng',
    'Tỷ lệ lấp đầy',
    'Danh mục tài sản',
  ]);
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
  expectAmountTotals(table);
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
    `leases?household_id=eq.${laneHousehold(2)}&status=in.(active,terminated)&start_date=lte.2026-10-07&or=(end_date.is.null,end_date.gte.2026-10-07)&select=id`,
  );
  expect(table.rows.map((row) => row.key).toSorted()).toEqual(active.map((lease) => lease.id).toSorted());
  expect(table.rows.map((row) => row.cells['#0'])).not.toContain('Phòng 7, Dãy trọ Dĩ An');
  expect(table.rows.map((row) => row.key)).not.toContain(laneLease(2, 'di-an', 7));
  expect(table.rows.find((row) => row.key === laneLease(2, 'thu-duc', 1))?.cells.endDate).toBe('01/11/2026');
  expectAmountTotals(table);
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await axe(page)).toEqual([]);
});

test("lane 3: October's collections equal what was allocated to October's bills, and Phòng 5's September bill is still owed", async ({ page }) => {
  await open(page, 'ryan.lane3@demo.esta.test', 'dark', DESKTOP);
  await page.goto('/reports?report=collections');
  await expect(report(page).getByRole('heading', { name: 'Thu tiền theo tháng năm 2026' })).toBeVisible();
  const table = await readReportTable(report(page));
  expect(table.columns, 'money not yet due is not called debt').toEqual(['Tháng', 'Phải thu', 'Đã thu', 'Chưa thu']);
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
  expectAmountTotals(table);
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

test('lane 4: on her phone, Mẹ reads Kho Biên Hòa empty 70 days and Dĩ An Phòng 8 empty 67 days on 07/10/2026 (W4)', async ({ page }) => {
  await open(page, 'me.lane4@demo.esta.test', 'dark', PHONE);
  await page.goto('/reports');
  await page.getByTestId('report-picker').getByRole('link', { name: 'Tỷ lệ lấp đầy' }).click();
  await expect(report(page).getByRole('heading', { name: 'Tỷ lệ lấp đầy năm 2026, đến ngày 07/10/2026' })).toBeVisible();
  const table = await readReportTable(report(page));
  const units = await rest<{ id: string; label: string; property_id: string }[]>(
    page,
    'GET',
    `units?property_id=in.(${['bien-hoa', 'di-an', 'long-an'].map((key) => laneProperty(4, key)).join(',')})&select=id,label,property_id`,
  );
  const unit = (property: string, label?: string) => units.find((one) => one.property_id === laneProperty(4, property) && (label === undefined || one.label === label))?.id;
  const row = (key: string | undefined) => table.rows.find((candidate) => candidate.key === key)?.cells;
  expect(table.columns.at(-1)).toBe('Số ngày đang trống đến 07/10/2026');
  expect(row(unit('bien-hoa'))?.vacantFor).toBe('70');
  expect(row(unit('di-an', 'Phòng 8'))?.vacantFor).toBe('67');
  expect(row(unit('di-an', 'Phòng 7'))?.vacantFor).toBe('22');
  expect(unit('long-an'), 'Long An has a unit').toBeDefined();
  expect(table.rows.map((line) => line.key), 'Long An is held, not let').not.toContain(unit('long-an'));
  const count = (text: string | undefined) => Number(text?.replaceAll('.', ''));
  for (const id of ['occupied', 'vacant']) expect(count(table.totals.cells[id]), `${id} total`).toBe(sum(table.rows.map((line) => count(line.cells[id]))));
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await axe(page)).toEqual([]);
});

test("lane 5: Danh mục tài sản puts Quận 1's gross yield at its contracted annual rent over its latest valuation, as an estimate", async ({ page }) => {
  await open(page, 'ryan.lane5@demo.esta.test', 'light', DESKTOP);
  await page.goto('/reports?report=portfolio');
  await expect(report(page).getByRole('heading', { name: 'Danh mục tài sản ngày 07/10/2026' })).toBeVisible();
  await expect(report(page).getByText('Ước tính', { exact: true })).toBeVisible();
  const table = await readReportTable(report(page));
  const q1 = laneProperty(5, 'q1');
  const [latest] = await rest<{ as_of: string; value_vnd: number; method: string }[]>(page, 'GET', `valuations?property_id=eq.${q1}&as_of=lte.2026-10-07&order=as_of.desc,created_at.desc&limit=1&select=as_of,value_vnd,method`);
  const leases = await rest<{ id: string }[]>(page, 'GET', `leases?property_id=eq.${q1}&status=in.(active,terminated)&start_date=lte.2026-10-07&or=(end_date.is.null,end_date.gte.2026-10-07)&select=id`);
  const periods = await rest<{ period_start: string; period_end: string; monthly_rent_vnd: number }[]>(page, 'POST', 'rpc/lease_schedule', { p_lease_ids: leases.map((lease) => lease.id), p_until: '2026-10-31' });
  const monthly = sum(periods.filter((period) => period.period_start <= '2026-10-07' && period.period_end >= '2026-10-07').map((period) => period.monthly_rent_vnd));
  expect(latest?.method, 'the seed values Quận 1 by broker quote').toBe('broker_quote');
  const row = table.rows.find((candidate) => candidate.key === q1);
  expect(row?.amounts.value).toBe(latest?.value_vnd);
  expect(row?.cells.valuedOn).toBe(`${latest?.as_of.split('-').toReversed().join('/')}, Môi giới báo giá`);
  expect(row?.amounts.annualRent).toBe(monthly * 12);
  const bp = Math.round((monthly * 12 * 10_000) / (latest?.value_vnd ?? Infinity));
  expect(row?.cells.yield).toBe(`${(bp / 100).toFixed(2).replace('.', ',').replace(/,?0+$/, '')}%`);
  expectAmountTotals(table);
  expect(await axe(page)).toEqual([]);
});

test("lane 7: Mẹ downloads her owner summary as a PDF holding her name with its diacritics and the screen's totals", async ({ page }) => {
  await open(page, 'me.lane7@demo.esta.test', 'light', DESKTOP);
  await page.goto('/reports?report=owners');
  await expect(report(page).getByRole('heading', { name: 'Tổng kết năm 2026 theo chủ sở hữu' })).toBeVisible();
  await expect(report(page).getByText('Ước tính, không phải tư vấn thuế')).toBeVisible();
  const table = await readReportTable(report(page));
  const [download] = await Promise.all([page.waitForEvent('download'), report(page).getByRole('link', { name: 'Tải PDF' }).click()]);
  expect(download.suggestedFilename()).toBe('chu-so-huu-2026.pdf');
  const lines = (await pdfText(await readFile(await download.path()))).replaceAll('\u00a0', ' ').split('\n');
  expect(lines).toContain('Nguyễn Thị Demo');
  expect(lines).toContain('Tổng kết năm 2026 theo chủ sở hữu');
  const totals = lines.slice(lines.lastIndexOf('Tổng cộng') + 1);
  expect(totals.map(amountOf), 'the PDF totals row').toEqual(table.ids.map((id) => table.totals.amounts[id]));
  for (const id of table.ids) expect(table.totals.amounts[id], `${id} total`).toBe(sum(table.rows.map((line) => line.amounts[id] ?? 0)));
});

test("lane 8: on her phone, Mẹ's 2026 revenue on the owner summary is the projected figure on her tax card", async ({ page }) => {
  await open(page, 'me.lane8@demo.esta.test', 'dark', PHONE);
  await page.goto('/reports/tax');
  const projected = amountOf((await page.getByTestId('tax-projected').textContent()) ?? '');
  await page.getByTestId('report-picker').getByRole('link', { name: 'Theo chủ sở hữu' }).click();
  await expect(report(page).getByRole('heading', { name: 'Tổng kết năm 2026 theo chủ sở hữu' })).toBeVisible();
  const table = await readReportTable(report(page));
  const mine = table.rows.find((row) => row.cells['#0'] === 'Nguyễn Thị Demo');
  expect(mine?.amounts.revenue).toBe(projected);
  expect(projected, 'SPEC §9.3 puts Mẹ between 400 and 500 million').toBeGreaterThanOrEqual(400_000_000);
  expect(await noSidewaysScroll(page)).toBe(true);
  expect(await axe(page)).toEqual([]);
});

test('lane 9: offline, Tải PDF says it could not download and the report stays on screen', async ({ page }) => {
  await open(page, 'ryan.lane9@demo.esta.test', 'light', PHONE);
  await page.goto('/reports?report=owners');
  await expect(report(page).getByTestId('report-total')).toBeVisible();
  await page.context().setOffline(true);
  await report(page).getByRole('link', { name: 'Tải PDF' }).click();
  await expect(report(page).getByRole('alert')).toHaveText('Chưa tải được. Kiểm tra kết nối mạng rồi thử lại.');
  await expect(report(page).getByTestId('report-total')).toBeVisible();
  await page.context().setOffline(false);
});
