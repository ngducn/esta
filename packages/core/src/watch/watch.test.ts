import { describe, expect, it } from 'vitest';
import { addDays } from '../date/calendar';
import { isoDate, type IsoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { evaluateWatch, watchDedupeKey } from './registry';
import type { WatchRuleId, WatchSnapshot } from './types';

const AS_OF = isoDate('2026-10-07');
const d = (days: number) => addDays(AS_OF, days);

type Snapshot = WatchSnapshot;
type Property = Snapshot['properties'][number];
type Lease = Snapshot['leases'][number];
type Invoice = Snapshot['invoices'][number];

const property = (over: Partial<Property> = {}): Property => ({ id: 'p1', kind: 'townhouse', useMode: 'rental', archived: false, completenessPercent: 100, ...over });
const lease = (over: Partial<Lease> = {}): Lease => ({
  id: 'l1',
  unitId: 'u1',
  propertyId: 'p1',
  tenantId: 't1',
  status: 'active',
  start_date: isoDate('2026-01-01'),
  end_date: null,
  renewed: false,
  depositHeldVnd: vnd(0),
  ...over,
});
const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'i1',
  leaseId: 'l1',
  dueDate: AS_OF,
  totalVnd: vnd(1_000_000),
  allocatedVnd: vnd(0),
  outstandingVnd: vnd(1_000_000),
  paymentStatus: 'unpaid',
  ...over,
});

function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    householdId: 'h1',
    asOf: AS_OF,
    properties: [property()],
    units: [{ id: 'u1', propertyId: 'p1', availableFrom: null }],
    leases: [lease()],
    invoices: [],
    documents: [],
    meters: [],
    taxPositions: [],
    extractions: [],
    ...over,
  };
}

const facts = (rule: WatchRuleId, over: Partial<Snapshot>) => evaluateWatch(snapshot(over)).filter((fact) => fact.ruleId === rule);
const severities = (rule: WatchRuleId, over: Partial<Snapshot>) => facts(rule, over).map((fact) => fact.severity);

describe('W1 overdue', () => {
  it('is watch at 7 days late and action at 8', () => {
    expect(facts('W1', { invoices: [invoice({ dueDate: d(-7) })] })).toEqual([
      { ruleId: 'W1', subjectKey: 'invoice:i1', severity: 'watch', numbers: { days_overdue: 7, due_date: d(-7), outstanding_vnd: 1_000_000 } },
    ]);
    expect(severities('W1', { invoices: [invoice({ dueDate: d(-8) })] })).toEqual(['action']);
  });

  it('counts a partly paid invoice by what is still owed and passes over a paid one and one due today', () => {
    expect(facts('W1', { invoices: [invoice({ dueDate: d(-1), allocatedVnd: vnd(400_000), outstandingVnd: vnd(600_000), paymentStatus: 'partial' })] })[0]?.numbers.outstanding_vnd).toBe(600_000);
    expect(facts('W1', { invoices: [invoice({ dueDate: d(-30), allocatedVnd: vnd(1_000_000), paymentStatus: 'paid' })] })).toEqual([]);
    expect(facts('W1', { invoices: [invoice({ dueDate: AS_OF })] })).toEqual([]);
  });
});

describe('W2 due soon', () => {
  it('fires from today through 3 days ahead and not at 4', () => {
    expect(severities('W2', { invoices: [invoice({ dueDate: AS_OF })] })).toEqual(['info']);
    expect(facts('W2', { invoices: [invoice({ dueDate: d(3) })] })[0]?.numbers.days_until_due).toBe(3);
    expect(facts('W2', { invoices: [invoice({ dueDate: d(4) })] })).toEqual([]);
  });

  it('passes over a paid invoice and an overdue one', () => {
    expect(facts('W2', { invoices: [invoice({ dueDate: d(2), allocatedVnd: vnd(1_000_000), paymentStatus: 'paid' })] })).toEqual([]);
    expect(facts('W2', { invoices: [invoice({ dueDate: d(-1) })] })).toEqual([]);
  });
});

describe('W3 lease ending', () => {
  const ending = (days: number, over: Partial<Lease> = {}) => severities('W3', { leases: [lease({ end_date: d(days), ...over })] });

  it('is action through 30 days, watch from 31 to 60, and silent at 61', () => {
    expect([ending(30), ending(31), ending(60), ending(61)]).toEqual([['action'], ['watch'], ['watch'], []]);
  });

  it('is silent once a renewal is signed, or on an archived property', () => {
    expect(ending(20, { renewed: true })).toEqual([]);
    expect(severities('W3', { properties: [property({ archived: true })], leases: [lease({ end_date: d(20) })] })).toEqual([]);
  });

  it('counts a lease terminated on a future date until that date, and not one that has not started', () => {
    expect(ending(10, { status: 'terminated' })).toEqual(['action']);
    expect(ending(10, { start_date: d(1) })).toEqual([]);
  });
});

describe('W4 vacancy', () => {
  const vacant = (endedDaysAgo: number, over: Partial<Property> = {}) =>
    severities('W4', { properties: [property(over)], leases: [lease({ status: 'ended', start_date: isoDate('2025-01-01'), end_date: d(-endedDaysAgo) })] });

  it('is silent at 30 days, watch at 31 and 90, action at 91', () => {
    expect([vacant(30), vacant(31), vacant(90), vacant(91)]).toEqual([[], ['watch'], ['watch'], ['action']]);
  });

  it('counts a unit never let from its available date', () => {
    expect(facts('W4', { leases: [], units: [{ id: 'u1', propertyId: 'p1', availableFrom: d(-67) }] })[0]?.numbers).toEqual({ days_vacant: 67, vacant_since: d(-67) });
  });

  it('passes over a let unit, a property held rather than rented, and an archived one', () => {
    expect(severities('W4', { leases: [lease()] })).toEqual([]);
    expect(vacant(120, { useMode: 'held' })).toEqual([]);
    expect(vacant(120, { archived: true })).toEqual([]);
  });
});

describe('W5 document expiry', () => {
  const expiring = (days: number, propertyId: string | null = 'p1') => severities('W5', { documents: [{ id: 'doc1', propertyId, expiresOn: d(days) }] });

  it('is action through 7 days, watch from 8 to 30, and silent at 31', () => {
    expect([expiring(0), expiring(7), expiring(8), expiring(30), expiring(31)]).toEqual([['action'], ['action'], ['watch'], ['watch'], []]);
  });

  it('counts a document of no property and passes over one of an archived property', () => {
    expect(expiring(20, null)).toEqual(['watch']);
    expect(severities('W5', { properties: [property({ archived: true })], documents: [{ id: 'doc1', propertyId: 'p1', expiresOn: d(20) }] })).toEqual([]);
  });
});

describe('W6 deposit unsettled', () => {
  const unsettled = (endedDaysAgo: number, held: number, over: Partial<Snapshot> = {}) =>
    severities('W6', { leases: [lease({ status: 'ended', end_date: d(-endedDaysAgo), depositHeldVnd: vnd(held) })], ...over });

  it('is silent at 14 days and action at 15 while a deposit is held', () => {
    expect([unsettled(14, 2_800_000), unsettled(15, 2_800_000)]).toEqual([[], ['action']]);
  });

  it('is silent once the deposit is settled, and still counts a lease of an archived property', () => {
    expect(unsettled(60, 0)).toEqual([]);
    expect(unsettled(60, 2_800_000, { properties: [property({ archived: true })] })).toEqual(['action']);
  });
});

describe('W7 tax threshold', () => {
  const position = (progressBp: number) => ({ partyId: 'o1', year: 2026, projectedVnd: vnd(0), thresholdTotalVnd: vnd(0), thresholdVnd: vnd(500_000_000), progressBp });

  it('is silent at 79.99%, watch at 80% and action at 100%', () => {
    expect([7_999, 8_000, 9_999, 10_000].map((bp) => severities('W7', { taxPositions: [position(bp)] }))).toEqual([[], ['watch'], ['watch'], ['action']]);
    expect(facts('W7', { taxPositions: [position(8_000)] })[0]?.subjectKey).toBe('owner:o1:2026');
  });

  it('keeps one action item a year for the owner while every other rule keeps one a day', () => {
    const tax = { ruleId: 'W7', subjectKey: 'owner:o1:2026' } as const;
    expect(watchDedupeKey(tax, isoDate('2026-10-07'))).toBe(watchDedupeKey(tax, isoDate('2026-12-31')));
    expect(watchDedupeKey(tax, isoDate('2026-10-07'))).toBe('watch:W7:owner:o1:2026:2026');
    const overdue = { ruleId: 'W1', subjectKey: 'invoice:i1' } as const;
    expect(watchDedupeKey(overdue, isoDate('2026-10-07'))).not.toBe(watchDedupeKey(overdue, isoDate('2026-10-08')));
  });
});

describe('W8 meter readings missing', () => {
  const roomingHouse = (asOf: IsoDate, over: Partial<Snapshot> = {}) =>
    severities('W8', {
      asOf,
      properties: [property({ kind: 'rooming_house' })],
      leases: [lease()],
      meters: [{ id: 'm1', unitId: 'u1', lastReadOn: isoDate('2026-10-03') }],
      ...over,
    });

  it('is silent on day 5 and action on day 6 of a month with no reading yet', () => {
    expect([roomingHouse(isoDate('2026-11-05')), roomingHouse(isoDate('2026-11-06'))]).toEqual([[], ['action']]);
  });

  it('is silent once this month has a reading, for an empty room, and outside a rooming house', () => {
    expect(roomingHouse(isoDate('2026-10-07'))).toEqual([]);
    expect(roomingHouse(isoDate('2026-11-06'), { leases: [] })).toEqual([]);
    expect(roomingHouse(isoDate('2026-11-06'), { properties: [property({ kind: 'townhouse' })] })).toEqual([]);
  });
});

describe('W9 short payments', () => {
  const short = (allocated: readonly number[]) =>
    severities('W9', { invoices: allocated.map((paid, index) => invoice({ id: `i${index}`, dueDate: d(-30 * (index + 1)), allocatedVnd: vnd(paid), paymentStatus: paid === 0 ? 'unpaid' : 'partial' })) });

  it('is silent with one short invoice and watch when the last two are short', () => {
    expect(short([0, 1_000_000])).toEqual([]);
    expect(short([0, 899_999])).toEqual(['watch']);
  });

  it('reads 90% paid as paid enough', () => {
    expect(short([900_000, 0])).toEqual([]);
  });

  it('reads only invoices already due', () => {
    expect(severities('W9', { invoices: [invoice({ id: 'a', dueDate: d(-1) }), invoice({ id: 'b', dueDate: AS_OF })] })).toEqual([]);
  });
});

describe('W10 extraction waiting', () => {
  const waiting = (days: number) => severities('W10', { extractions: [{ documentId: 'doc1', propertyId: 'p1', waitingSince: d(-days) }] });

  it('is silent at 3 days and info at 4', () => {
    expect([waiting(3), waiting(4)]).toEqual([[], ['info']]);
  });
});

describe('W11 low completeness', () => {
  it('names only the lowest of two properties below 60%', () => {
    expect(
      facts('W11', { properties: [property({ id: 'a', completenessPercent: 55 }), property({ id: 'b', completenessPercent: 30 }), property({ id: 'c', completenessPercent: 60 })] }),
    ).toEqual([{ ruleId: 'W11', subjectKey: 'property:b', severity: 'info', numbers: { completeness_percent: 30 } }]);
  });

  it('passes over an archived property', () => {
    expect(facts('W11', { properties: [property({ archived: true, completenessPercent: 10 })] })).toEqual([]);
  });
});
