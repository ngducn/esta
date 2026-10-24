import { describe, expect, it } from 'vitest';
import { checkNote } from '../guard';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { describeFacts, type WatchLabels } from './describe';
import type { WatchFact, WatchSnapshot } from './types';

const AS_OF = isoDate('2026-10-07');

const SNAPSHOT: WatchSnapshot = {
  householdId: 'h1',
  asOf: AS_OF,
  properties: [
    { id: 'p1', kind: 'rooming_house', useMode: 'rental', archived: false, completenessPercent: 100 },
    { id: 'p2', kind: 'warehouse', useMode: 'rental', archived: false, completenessPercent: 40 },
  ],
  units: [
    { id: 'u5', propertyId: 'p1', availableFrom: null },
    { id: 'u8', propertyId: 'p1', availableFrom: isoDate('2026-08-01') },
    { id: 'w1', propertyId: 'p2', availableFrom: null },
  ],
  leases: [{ id: 'l5', unitId: 'u5', propertyId: 'p1', tenantId: 't1', status: 'active', start_date: isoDate('2026-01-01'), end_date: null, renewed: false, depositHeldVnd: vnd(0) }],
  invoices: [
    { id: 'i1', leaseId: 'l5', periodStart: isoDate('2026-09-01'), dueDate: isoDate('2026-09-25'), totalVnd: vnd(3_500_000), allocatedVnd: vnd(0), outstandingVnd: vnd(3_500_000), paymentStatus: 'unpaid' },
  ],
  documents: [],
  meters: [],
  taxPositions: [],
  extractions: [],
};

const LABELS: WatchLabels = {
  properties: new Map([
    ['p1', 'Nhà trọ Dĩ An Demo'],
    ['p2', 'Kho Biên Hòa Demo'],
  ]),
  units: new Map([
    ['u5', { label: 'Phòng 5', whole: false }],
    ['u8', { label: 'Phòng 8', whole: false }],
    ['w1', { label: 'Nguyên căn', whole: true }],
  ]),
  parties: new Map([
    ['t1', 'Lê Văn Demo'],
    ['o1', 'Nguyễn Thị Demo'],
  ]),
  documents: new Map(),
};

const FACTS: WatchFact[] = [
  { ruleId: 'W1', subjectKey: 'invoice:i1', severity: 'action', numbers: { days_overdue: 12, due_date: isoDate('2026-09-25'), outstanding_vnd: 3_500_000 } },
  { ruleId: 'W4', subjectKey: 'unit:u8', severity: 'watch', numbers: { days_vacant: 67, vacant_since: isoDate('2026-08-01') } },
  { ruleId: 'W4', subjectKey: 'unit:w1', severity: 'watch', numbers: { days_vacant: 70, vacant_since: isoDate('2026-07-29') } },
  { ruleId: 'W7', subjectKey: 'owner:o1:2026', severity: 'watch', numbers: { year: 2026, progress_bp: 8_200, projected_vnd: 410_000_000, threshold_total_vnd: 500_000_000, threshold_vnd: 500_000_000 } },
  { ruleId: 'W10', subjectKey: 'document:d9', severity: 'info', numbers: { days_waiting: 4, waiting_since: null } },
];

const described = describeFacts(FACTS, SNAPSHOT, LABELS, 'vi');
const byRule = (rule: string) => described.filter(({ fact }) => fact.ruleId === rule).map(({ record }) => record);

describe('describeFacts', () => {
  it('names an overdue bill by its room, property and tenant, with every figure formatted', () => {
    expect(byRule('W1')[0]).toMatchObject({
      rule_id: 'W1',
      severity: 'action',
      unit_label: 'Phòng 5',
      property_label: 'Nhà trọ Dĩ An Demo',
      place_label: 'Phòng 5 Nhà trọ Dĩ An Demo',
      tenant_name: 'Lê Văn Demo',
      days_overdue_display: '12 ngày',
      due_date_display: '25/09/2026',
      due_date_year_display: '2026',
      outstanding_display: '3.500.000 ₫',
      outstanding_compact: '3,5 tr',
    });
  });

  it('names a whole-unit property by its nickname alone and lists facts of one rule by name', () => {
    expect(byRule('W4').map((record) => record.place_label)).toEqual(['Kho Biên Hòa Demo', 'Phòng 8 Nhà trọ Dĩ An Demo']);
  });

  it('writes a year without grouping and a share in basis points as a percent', () => {
    expect(byRule('W7')[0]).toMatchObject({ owner_name: 'Nguyễn Thị Demo', year_display: '2026', progress_display: '82%', threshold_compact: '500 tr' });
  });

  it('leaves a missing name or figure blank, for the guard to answer', () => {
    expect(byRule('W10')[0]).toMatchObject({ document_label: '', waiting_since_display: '' });
  });

  it('links each fact to its record', () => {
    expect(described.map(({ link }) => link)).toEqual(['esta://invoice/i1', 'esta://unit/w1', 'esta://unit/u8', 'esta://party/o1', 'esta://document/d9']);
  });

  it('fills a realistic note through the guard', () => {
    const sheet = new Map(described.map(({ record }, i) => [`f${i + 1}`, record]));
    const note = checkNote('{{f1.place_label}} quá hạn {{f1.days_overdue_display}}, còn nợ {{f1.outstanding_display}}. Ngưỡng thuế năm {{f4.year_display}}.', sheet);
    expect(note.ok && note.value.text).toBe('Phòng 5 Nhà trọ Dĩ An Demo quá hạn 12 ngày, còn nợ 3.500.000 ₫. Ngưỡng thuế năm 2026.');
  });
});
