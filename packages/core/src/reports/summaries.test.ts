import { describe, expect, it } from 'vitest';
import { isoDate as d, type IsoDate } from '../date/iso-date';
import type { ExportTable } from '../export/table';
import { vnd } from '../money/vnd';
import { schedulePeriods } from '../schedule/fixtures';
import { taxRuleRowSchema } from '../tax/rules';
import type { Valuation } from '../valuations/schema';
import { emptySnapshot, reportLease, testUuid as uuid } from './fixtures';
import { checkReportInvariants, holds } from './invariants';
import { occupancy, vacantDays } from './occupancy';
import { ownerSummary, UNATTRIBUTED } from './ownerSummary';
import { portfolioSummary } from './portfolio';
import { propertyPnl } from './propertyPnl';
import type { ReportTenancy, ReportUnit } from './snapshot';
import { yearPeriod } from './snapshot';

const ASOF = d('2026-10-07');
const YEAR = { ...yearPeriod(2026, ASOF), asOf: ASOF };
const text = (table: ExportTable) => [...table.rows, table.totals].map((row) => row.cells.map((cell) => cell.value));
const row = (table: ExportTable, key: string) => table.rows.find((candidate) => candidate.key === key)?.cells.map((cell) => cell.value);

const BIEN_HOA = uuid();
const DI_AN = uuid();
const unit = (propertyId: string, label: string, change: Partial<ReportUnit> = {}): ReportUnit => ({
  id: uuid(),
  propertyId,
  propertyName: propertyId === BIEN_HOA ? 'Kho Biên Hòa' : 'Dãy trọ Dĩ An',
  label,
  wholeUnit: false,
  availableFrom: null,
  ...change,
});
const tenancy = (unitId: string, status: ReportTenancy['status'], start: string, end: string | null): ReportTenancy => ({
  unitId,
  status,
  start_date: d(start),
  end_date: end === null ? null : d(end),
});

describe('occupancy (FIN-4, AGENT.md §5.3 W4)', () => {
  const bienHoa = unit(BIEN_HOA, 'Nguyên căn', { wholeUnit: true });
  const room7 = unit(DI_AN, 'Phòng 7', { availableFrom: d('2025-01-01') });
  const room8 = unit(DI_AN, 'Phòng 8', { availableFrom: d('2026-08-01') });
  const room2 = unit(DI_AN, 'Phòng 2');
  const room3 = unit(DI_AN, 'Phòng 3');
  const tenancies = [
    tenancy(bienHoa.id, 'ended', '2025-08-01', '2026-07-29'),
    tenancy(room7.id, 'ended', '2025-09-16', '2026-09-15'),
    tenancy(room2.id, 'terminated', '2026-01-01', '2026-12-15'),
    tenancy(room3.id, 'ended', '2025-04-01', '2026-03-31'),
    tenancy(room3.id, 'active', '2026-03-01', null),
    tenancy(room3.id, 'draft', '2026-01-01', null),
  ];
  const table = occupancy(emptySnapshot(YEAR, { units: [room8, bienHoa, room3, room7, room2], tenancies }), {
    place: 'Nơi cho thuê',
    occupied: 'Có người thuê',
    vacant: 'Trống',
    rate: 'Tỷ lệ',
    vacantFor: 'Trống liên tục',
    total: 'Tổng cộng',
    placeName: (label, property) => `${label}, ${property}`,
    percent: (bp) => `${bp} bp`,
    leased: 'Đang cho thuê',
    none: '—',
  });

  it('counts Kho Biên Hòa empty 70 days since its lease ended on 29/07 and Phòng 8 67 days since it was free on 01/08', () => {
    expect(row(table, bienHoa.id)).toEqual(['Kho Biên Hòa', 210, 70, '7500 bp', 70]);
    expect(row(table, room8.id)).toEqual(['Phòng 8, Dãy trọ Dĩ An', 0, 68, '0 bp', 67]);
    expect(row(table, room7.id)?.at(-1), 'Phòng 7 ended 15/09').toBe(22);
  });

  it('keeps a lease terminated from 15/12 occupying its room until then', () => {
    expect(row(table, room2.id)).toEqual(['Phòng 2, Dãy trọ Dĩ An', 280, 0, '10000 bp', 'Đang cho thuê']);
  });

  it('counts a day held by a lease and its early renewal once, and never counts a draft', () => {
    expect(row(table, room3.id)).toEqual(['Phòng 3, Dãy trọ Dĩ An', 280, 0, '10000 bp', 'Đang cho thuê']);
  });

  it('totals the days and rates the whole', () => {
    expect(table.totals.cells.map((cell) => cell.value)).toEqual(['Tổng cộng', 210 + 0 + 280 + 280 + 258, 70 + 68 + 22, `${Math.round(((210 + 280 + 280 + 258) * 10_000) / (280 + 68 + 280 + 280 + 280))} bp`, '']);
    expect(checkReportInvariants(emptySnapshot(YEAR), { pnl: propertyPnl(emptySnapshot(YEAR), { property: '', income: '', expenses: '', noi: '', total: '' }), occupancy: table }).filter((check) => !holds(check))).toEqual([]);
  });

  it('reads W4 from the last end date, from available_from, and not at all without either', () => {
    expect(vacantDays(room8, [], ASOF)).toBe(67);
    expect(vacantDays(room8, [tenancy(room8.id, 'ended', '2026-08-10', '2026-09-30')], ASOF)).toBe(7);
    expect(vacantDays(unit(DI_AN, 'Phòng 9'), [], ASOF)).toBeNull();
    expect(vacantDays(unit(DI_AN, 'Phòng 9', { availableFrom: d('2026-11-01') }), [], ASOF)).toBeNull();
    expect(vacantDays(room8, [tenancy(room8.id, 'active', '2026-11-01', null)], ASOF), 'a signed lease starting later holds the room').toBe('leased');
  });
});

const Q1 = uuid();
const THU_DUC = uuid();
const LONG_AN = uuid();
const valuation = (propertyId: string, asOf: string, valueVnd: number, method: Valuation['method'] = 'broker_quote'): Valuation => ({
  id: uuid(),
  propertyId,
  asOf: d(asOf),
  valueVnd: vnd(valueVnd),
  method,
  sourceUrl: null,
  note: null,
});

describe('portfolioSummary (FIN-5)', () => {
  const q1 = reportLease(Q1, 'Nguyên căn', { rent_vnd: 6_500_000 }, { wholeUnit: true });
  const thuDuc = reportLease(THU_DUC, 'Nguyên căn', { status: 'terminated', end_date: '2026-11-01', terminated_on: '2026-11-01', rent_vnd: 12_000_000 });
  const snapshot = emptySnapshot(YEAR, {
    properties: [
      { id: Q1, name: 'Mặt bằng Quận 1' },
      { id: THU_DUC, name: 'Căn hộ Thủ Đức' },
      { id: LONG_AN, name: 'Đất Long An' },
    ],
    leases: [q1, thuDuc],
    schedule: [...schedulePeriods(q1.id, '2025-11-01', 6_500_000, 14), ...schedulePeriods(thuDuc.id, '2026-01-01', 12_000_000, 11)],
    valuations: [valuation(Q1, '2026-11-01', 9_000_000_000), valuation(Q1, '2026-07-01', 1_200_000_000), valuation(Q1, '2025-07-01', 1_000_000_000, 'owner_estimate'), valuation(LONG_AN, '2026-01-15', 2_000_000_000, 'state_price_reference')],
  });
  const table = portfolioSummary(snapshot, {
    property: 'Tài sản',
    value: 'Giá trị ước tính',
    valuedOn: 'Định giá',
    annualRent: 'Tiền thuê một năm',
    yield: 'Lợi suất gộp',
    total: 'Tổng cộng',
    dated: (date: IsoDate, method) => `${date} ${method}`,
    percent: (bp) => `${bp} bp`,
    noValuation: 'Chưa định giá',
    noLease: 'Chưa cho thuê',
  });

  it('reads the newest valuation not after today with its date and method, and a 650 bp yield from 78 million a year on 1,2 billion', () => {
    expect(row(table, Q1)).toEqual(['Mặt bằng Quận 1', 1_200_000_000, '2026-07-01 broker_quote', 78_000_000, '650 bp']);
  });

  it('shows no yield without a lease in effect or without a valuation, and counts a lease terminated from a later date', () => {
    expect(row(table, LONG_AN)).toEqual(['Đất Long An', 2_000_000_000, '2026-01-15 state_price_reference', 'Chưa cho thuê', '']);
    expect(row(table, THU_DUC)).toEqual(['Căn hộ Thủ Đức', 'Chưa định giá', '', 144_000_000, '']);
  });

  it('totals the values and the rents', () => {
    expect(table.totals.cells.map((cell) => cell.value)).toEqual(['Tổng cộng', 3_200_000_000, '', 222_000_000, '']);
  });
});

const ME = uuid();
const RYAN = uuid();
const RULE = taxRuleRowSchema.parse({
  kind: 'vn_rental_individual',
  effective_from: '2026-01-01',
  effective_to: null,
  params: {
    threshold_vnd: 500_000_000,
    threshold_scope: 'all_business_revenue_of_person',
    vat_rate_bp: 500,
    vat_base: 'total_rental_revenue_when_over_threshold',
    pit_rate_bp: 500,
    pit_base: 'revenue_above_threshold',
  },
  source_citation: 'Nguồn Demo',
  note: null,
});
const taxLease = (id: string, propertyId: string, declaringPartyId: string | null = null) => ({ id, propertyId, active: true, terminatedOn: null, taxPayer: 'owner' as const, declaringPartyId, recurringCharges: [] });
const monthly = (leaseId: string, rent: number) => schedulePeriods(leaseId, '2026-01-01', rent, 12).map(({ start, end, rentVnd }) => ({ leaseId, start, end, rentVnd }));
const LABELS = { owner: 'Chủ sở hữu', revenue: 'Doanh thu', income: 'Đã nhận', expenses: 'Chi phí', vat: 'GTGT', pit: 'TNCN', total: 'Tổng cộng', unattributed: 'Chưa ghi chủ', noRule: 'Chưa có quy định' };

describe('ownerSummary (FIN-4, FIN-3)', () => {
  const shares = [
    { propertyId: Q1, partyId: ME, shareBp: 6_000 },
    { propertyId: Q1, partyId: RYAN, shareBp: 4_000 },
    { propertyId: DI_AN, partyId: ME, shareBp: 9_000 },
  ];
  const snapshot = emptySnapshot(YEAR, {
    properties: [
      { id: Q1, name: 'Mặt bằng Quận 1' },
      { id: DI_AN, name: 'Dãy trọ Dĩ An' },
    ],
    incomes: [
      { propertyId: Q1, receivedOn: d('2026-03-02'), amountVnd: vnd(100_000_001) },
      { propertyId: DI_AN, receivedOn: d('2026-05-02'), amountVnd: vnd(10_000_000) },
    ],
    expenses: [{ propertyId: Q1, paidOn: d('2026-04-01'), category: 'repair', amountVnd: vnd(1_000_001) }],
    owners: [
      { id: RYAN, name: 'Trần Minh Demo', otherBusinessRevenueVnd: vnd(0) },
      { id: ME, name: 'Nguyễn Thị Demo', otherBusinessRevenueVnd: vnd(20_000_000) },
    ],
    tax: { leases: [taxLease('q1', Q1), taxLease('di-an', DI_AN, RYAN)], schedule: [...monthly('q1', 50_000_000), ...monthly('di-an', 3_000_000)], shares, rules: [RULE] },
  });
  const table = ownerSummary(snapshot, LABELS);

  it("gives each owner the tax card's projected revenue and estimates, and splits 100.000.001 received 60/40 as 60.000.001 and 40.000.000", () => {
    expect(text(table)).toEqual([
      ['Nguyễn Thị Demo', 360_000_000, 60_000_001 + 9_000_000, 600_001, 0, 0],
      ['Trần Minh Demo', 240_000_000 + 36_000_000, 40_000_000, 400_000, 0, 0],
      ['Chưa ghi chủ', '', 1_000_000, 0, '', ''],
      ['Tổng cộng', 636_000_000, 110_000_001, 1_000_001, 0, 0],
    ]);
  });

  it("taxes Mẹ's other business revenue toward the threshold and shows a year with no rule", () => {
    const over = ownerSummary({ ...snapshot, owners: [{ id: ME, name: 'Nguyễn Thị Demo', otherBusinessRevenueVnd: vnd(200_000_000) }] }, LABELS);
    expect(row(over, ME)?.slice(4)).toEqual([18_000_000, 0]);
    const noRule = ownerSummary({ ...snapshot, tax: { ...snapshot.tax, rules: [] } }, LABELS);
    expect(row(noRule, ME)).toEqual(['Nguyễn Thị Demo', 'Chưa có quy định', 69_000_001, 600_001, 'Chưa có quy định', 'Chưa có quy định']);
  });

  it('adds up to the P&L, and fails the invariant when a share holder is missing from the owners', () => {
    const pnl = propertyPnl(snapshot, { property: '', income: 'Thu', expenses: 'Chi', noi: '', total: '' });
    expect(checkReportInvariants(snapshot, { pnl, owners: table }).filter((check) => !holds(check))).toEqual([]);
    const missing = ownerSummary({ ...snapshot, owners: snapshot.owners.filter((owner) => owner.id !== RYAN) }, LABELS);
    expect(checkReportInvariants(snapshot, { pnl, owners: missing }).filter((check) => !holds(check))).toEqual([
      { kind: 'ownerSplit', column: 'income', expectedVnd: 110_000_001, reportedVnd: 70_000_001 },
      { kind: 'ownerSplit', column: 'expenses', expectedVnd: 1_000_001, reportedVnd: 600_001 },
    ]);
  });

  it('leaves the unattributed row out when every share is held', () => {
    const whole = ownerSummary({ ...snapshot, tax: { ...snapshot.tax, shares: shares.map((share) => (share.propertyId === DI_AN ? { ...share, shareBp: 10_000 } : share)) } }, LABELS);
    expect(whole.rows.map((line) => line.key)).not.toContain(UNATTRIBUTED);
  });
});
