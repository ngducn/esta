import { describe, expect, it } from 'vitest';
import { addDays, addMonths } from '../date/calendar';
import { isoDate as d, type IsoDate } from '../date/iso-date';
import type { ExportTable } from '../export/table';
import { vnd } from '../money/vnd';
import { schedulePeriods } from '../schedule/fixtures';
import { monthlyCollections } from './collections';
import { emptySnapshot, reportLease, testUuid as uuid } from './fixtures';
import { checkReportInvariants, holds } from './invariants';
import { propertyPnl } from './propertyPnl';
import { rentRoll } from './rentRoll';
import { yearPeriod, type ReportInvoice, type ReportLease, type ReportSnapshot } from './snapshot';

const DI_AN = uuid();
const Q7 = uuid();
const ASOF = d('2026-10-07');

const lease = (unitLabel: string, values: Record<string, unknown> = {}, extra: Partial<ReportLease> = {}): ReportLease =>
  reportLease(typeof values.property_id === 'string' ? values.property_id : DI_AN, unitLabel, values, extra);

const invoice = (leaseId: string, periodStart: string, totalVnd: number, allocatedVnd: number, status: ReportInvoice['status'] = 'issued'): ReportInvoice => ({
  leaseId,
  status,
  periodStart: d(periodStart),
  periodEnd: addDays(addMonths(d(periodStart), 1), -1),
  dueDate: d(`${periodStart.slice(0, 8)}05`),
  totalVnd: vnd(totalVnd),
  allocatedVnd: vnd(allocatedVnd),
  outstandingVnd: vnd(totalVnd - allocatedVnd),
});

const room5 = lease('Phòng 5', { paid_through_date: '2026-08-31' });
const room2Terminated = lease('Phòng 2', { status: 'terminated', end_date: '2026-12-15', terminated_on: '2026-12-15', paid_through_date: '2026-10-31' });
const q7 = lease('Nguyên căn', { property_id: Q7, rent_vnd: 20_000_000, billing_cycle_months: 3, end_date: '2026-11-01', paid_through_date: '2026-12-31' }, {
  propertyName: 'Nhà phố Q7 Demo',
  wholeUnit: true,
  depositHeldVnd: vnd(40_000_000),
});
const room10 = lease('Phòng 10', { paid_through_date: '2026-09-30' }, { tenantName: null, depositHeldVnd: vnd(0) });

const septemberRoom5 = invoice(room5.id, '2026-09-01', 3_200_000, 0);
const octoberRoom10 = invoice(room10.id, '2026-10-01', 3_000_000, 3_000_000);

const snapshot = (period: { from: IsoDate; to: IsoDate }): ReportSnapshot => ({
  ...emptySnapshot({ ...period, asOf: ASOF }),
  properties: [
    { id: Q7, name: 'Nhà phố Q7 Demo' },
    { id: DI_AN, name: 'Dãy trọ Dĩ An Demo' },
  ],
  incomes: [
    { propertyId: DI_AN, receivedOn: d('2025-12-31'), amountVnd: vnd(1_000_000) },
    { propertyId: DI_AN, receivedOn: d('2026-09-30'), amountVnd: vnd(3_000_000) },
    { propertyId: DI_AN, receivedOn: d('2026-10-01'), amountVnd: vnd(2_000_000) },
    { propertyId: DI_AN, receivedOn: d('2026-10-05'), amountVnd: vnd(1_000_000) },
    { propertyId: Q7, receivedOn: d('2026-07-02'), amountVnd: vnd(60_000_000) },
  ].filter((fact) => fact.receivedOn >= period.from && fact.receivedOn <= period.to),
  expenses: [
    { propertyId: DI_AN, paidOn: d('2026-10-03'), category: 'repair' as const, amountVnd: vnd(500_000) },
    { propertyId: Q7, paidOn: d('2026-03-10'), category: 'land_tax' as const, amountVnd: vnd(4_000_000) },
  ].filter((fact) => fact.paidOn >= period.from && fact.paidOn <= period.to),
  invoices: [
    invoice(room5.id, '2026-08-01', 3_000_000, 3_000_000),
    septemberRoom5,
    invoice(room10.id, '2026-09-01', 3_000_000, 3_000_000),
    invoice(room5.id, '2026-10-01', 3_200_000, 1_000_000),
    octoberRoom10,
    invoice(room10.id, '2026-10-01', 3_000_000, 0, 'void'),
    invoice(room10.id, '2026-11-01', 3_000_000, 0, 'draft'),
  ],
  leases: [room5, room2Terminated, q7, room10],
  leaseInvoices: [invoice(room5.id, '2026-08-01', 3_000_000, 3_000_000), septemberRoom5, invoice(room10.id, '2026-09-01', 3_000_000, 3_000_000), octoberRoom10],
  schedule: [
    ...schedulePeriods(room5.id, '2025-11-01', 3_000_000, 14).map((period) => (period.start >= '2026-09-01' ? { ...period, monthlyRentVnd: vnd(3_200_000) } : period)),
    ...schedulePeriods(q7.id, '2026-01-01', 20_000_000, 4, 3),
    ...schedulePeriods(room10.id, '2025-11-01', 3_000_000, 14),
    ...schedulePeriods(room2Terminated.id, '2025-11-01', 3_000_000, 14),
  ],
});

const year2026 = snapshot(yearPeriod(2026, ASOF));

const pnlLabels = { property: 'Tài sản', income: 'Thu', expenses: 'Chi', noi: 'Lãi ròng', total: 'Tổng cộng' };
const rollLabels = {
  place: 'Nơi thuê',
  tenant: 'Người thuê',
  rent: 'Tiền thuê mỗi tháng',
  cycle: 'Kỳ thu',
  paidThrough: 'Đã thu đến',
  nextDue: 'Hạn kế tiếp',
  deposit: 'Tiền cọc đang giữ',
  endDate: 'Hết hạn',
  total: 'Tổng cộng',
  placeName: (unit: string, property: string) => `${unit} · ${property}`,
  cycleMonths: (months: number) => `${months} tháng`,
  date: (date: IsoDate) => date.split('-').toReversed().join('/'),
  none: '—',
  openEnded: 'Không thời hạn',
};
const collectionLabels = { month: 'Tháng', monthName: (first: IsoDate) => `Tháng ${Number(first.slice(5, 7))}`, billed: 'Phải thu', collected: 'Đã thu', outstanding: 'Còn nợ', total: 'Tổng cộng' };

const text = (table: ExportTable) => [...table.rows, table.totals].map((row) => row.cells.map((cell) => cell.value));

describe('propertyPnl (FIN-4)', () => {
  it('gives each property its cash income for the year, its expenses and its net, and a totals row', () => {
    expect(yearPeriod(2026, ASOF)).toEqual({ from: '2026-01-01', to: '2026-10-31' });
    expect(text(propertyPnl(year2026, pnlLabels))).toEqual([
      ['Dãy trọ Dĩ An Demo', 6_000_000, 500_000, 5_500_000],
      ['Nhà phố Q7 Demo', 60_000_000, 4_000_000, 56_000_000],
      ['Tổng cộng', 66_000_000, 4_500_000, 61_500_000],
    ]);
  });

  it('counts money on the day it was received, so 30/09 and 01/10 land in different months and 2025 stays out of 2026', () => {
    const checks = checkReportInvariants(year2026, { pnl: propertyPnl(year2026, pnlLabels) });
    const month = (first: string) => checks.find((check) => check.kind === 'monthIncome' && check.propertyId === DI_AN && check.month === first);
    expect(month('2026-09-01')).toMatchObject({ expectedVnd: 3_000_000, reportedVnd: 3_000_000 });
    expect(month('2026-10-01')).toMatchObject({ expectedVnd: 3_000_000, reportedVnd: 3_000_000 });
    expect(month('2025-12-01')).toBeUndefined();
  });
});

describe('rentRoll (FIN-4)', () => {
  const table = rentRoll(year2026, rollLabels);

  it('shows the rent in force, the cycle, paid through, the next due date, the deposit held and the end date', () => {
    expect(text(table)).toEqual([
      ['Phòng 2 · Dãy trọ Dĩ An Demo', 'Người thuê Phòng 2 Demo', 3_000_000, '1 tháng', '31/10/2026', '01/11/2026', 3_000_000, '15/12/2026'],
      ['Phòng 5 · Dãy trọ Dĩ An Demo', 'Người thuê Phòng 5 Demo', 3_200_000, '1 tháng', '31/08/2026', '01/09/2026', 3_000_000, 'Không thời hạn'],
      ['Phòng 10 · Dãy trọ Dĩ An Demo', '—', 3_000_000, '1 tháng', '31/10/2026', '01/11/2026', 0, 'Không thời hạn'],
      ['Nhà phố Q7 Demo', 'Người thuê Nguyên căn Demo', 20_000_000, '3 tháng', '31/12/2026', '—', 40_000_000, '01/11/2026'],
      ['Tổng cộng', '', 29_200_000, '', '', '', 46_000_000, ''],
    ]);
  });

  it('moves paid through past a settled October bill but not past the unpaid September one', () => {
    expect(table.rows.find((row) => row.key === room5.id)?.cells[4]?.value).toBe('31/08/2026');
    const paid = rentRoll({ ...year2026, leaseInvoices: [...year2026.leaseInvoices.filter((bill) => bill !== septemberRoom5), { ...septemberRoom5, allocatedVnd: vnd(3_200_000), outstandingVnd: vnd(0) }] }, rollLabels);
    expect(paid.rows.find((row) => row.key === room5.id)?.cells[4]?.value).toBe('30/09/2026');
  });
});

describe('monthlyCollections (FIN-4)', () => {
  const table = monthlyCollections(year2026, collectionLabels);
  const row = (key: string) => table.rows.find((candidate) => candidate.key === key)?.cells.map((cell) => cell.value);

  it('groups issued bills by due month with what they billed, what was allocated to them and what is still owed', () => {
    expect(table.rows.map((candidate) => candidate.key)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(row('2026-10')).toEqual(['Tháng 10', 6_200_000, 4_000_000, 2_200_000]);
    expect(row('2026-08')).toEqual(['Tháng 8', 3_000_000, 3_000_000, 0]);
    expect(table.totals.cells.map((cell) => cell.value)).toEqual(['Tổng cộng', 15_400_000, 10_000_000, 5_400_000]);
  });

  it("keeps Phòng 5's unpaid September bill outstanding in September's row when the view is October's", () => {
    expect(row('2026-09')).toEqual(['Tháng 9', 6_200_000, 3_000_000, 3_200_000]);
  });
});

describe('checkReportInvariants (FIN-4)', () => {
  const tables = { pnl: propertyPnl(year2026, pnlLabels), rentRoll: rentRoll(year2026, rollLabels), collections: monthlyCollections(year2026, collectionLabels) };

  it('holds for every month, every property and every totals row the builders produce', () => {
    const checks = checkReportInvariants(year2026, tables);
    expect(checks.filter((check) => check.kind === 'monthIncome')).toHaveLength(2 * 10);
    expect(checks.filter((check) => check.kind === 'totals').map((check) => `${check.report}.${check.column}`)).toEqual([
      'pnl.income', 'pnl.expenses', 'pnl.noi', 'rentRoll.rent', 'rentRoll.deposit', 'collections.billed', 'collections.collected', 'collections.outstanding',
    ]);
    expect(checks.filter((check) => !holds(check))).toEqual([]);
  });

  it('fails on a tampered totals cell', () => {
    const cells = tables.collections.totals.cells.map((cell, index) => (index === 1 ? { kind: 'vnd' as const, value: vnd(15_400_001) } : cell));
    const tampered = { ...tables.collections, totals: { key: 'total', cells } };
    expect(checkReportInvariants(year2026, { ...tables, collections: tampered }).filter((check) => !holds(check))).toEqual([
      { kind: 'totals', report: 'collections', column: 'billed', expected: 15_400_000, reported: 15_400_001 },
    ]);
  });

  it("fails when a property's P&L income is not its allocation_facts sum", () => {
    const rows = tables.pnl.rows.map((row) => (row.key === Q7 ? { ...row, cells: row.cells.map((cell, index) => (index === 1 ? { kind: 'vnd' as const, value: vnd(1) } : cell)) } : row));
    const failed = checkReportInvariants(year2026, { pnl: { ...tables.pnl, rows } }).filter((check) => !holds(check));
    expect(failed.map((check) => check.kind)).toEqual(['pnlIncome', 'totals']);
  });
});
