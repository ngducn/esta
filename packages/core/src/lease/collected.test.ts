import { describe, expect, it } from 'vitest';
import { isoDate as d } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { addDays, addMonths } from '../date/calendar';
import { collectedThrough, type BilledPeriod } from './collected';

const period = (start: string, end: string, outstanding: number, status: BilledPeriod['status'] = 'issued'): BilledPeriod => ({
  status,
  periodStart: d(start),
  periodEnd: d(end),
  outstandingVnd: vnd(outstanding),
});

/** `count` monthly periods from `start`, those at the `unpaid` positions still owed. */
const monthly = (start: string, count: number, unpaid: readonly number[] = []): BilledPeriod[] =>
  Array.from({ length: count }, (_, i) => {
    const from = addMonths(d(start), i);
    return period(from, addDays(addMonths(from, 1), -1), unpaid.includes(i) ? 2_800_000 : 0);
  });

describe('collectedThrough', () => {
  it('reads Dĩ An Phòng 5 through 2026-09-24: seven paid months from its start, then the unpaid one due 2026-09-25', () => {
    expect(collectedThrough(null, monthly('2026-02-25', 9, [7, 8]))).toBe('2026-09-24');
  });

  it('extends the date entered at activation through the paid periods billed after it (Phòng 1, paid through 2026-10-24)', () => {
    expect(collectedThrough(d('2025-10-24'), monthly('2025-10-25', 13, [12]))).toBe('2026-10-24');
  });

  it('reads Nhà phố Q7 through 2026-12-31 from its paid quarters', () => {
    const quarters = [
      period('2025-10-01', '2025-12-31', 0),
      period('2026-01-01', '2026-03-31', 0),
      period('2026-04-01', '2026-06-30', 0),
      period('2026-07-01', '2026-09-30', 0),
      period('2026-10-01', '2026-12-31', 0),
    ];
    expect(collectedThrough(d('2025-09-30'), quarters.toReversed())).toBe('2026-12-31');
  });

  it('keeps the activation date when no billed period is paid, and reads nothing when there is neither', () => {
    expect(collectedThrough(d('2026-09-30'), [period('2026-10-01', '2026-10-31', 9_000_000)])).toBe('2026-09-30');
    expect(collectedThrough(null, [period('2026-10-01', '2026-10-31', 9_000_000)])).toBeNull();
    expect(collectedThrough(null, [])).toBeNull();
  });

  it('stops at the first unpaid period even when a later one is paid ahead', () => {
    expect(collectedThrough(null, [period('2026-08-01', '2026-08-31', 0), period('2026-09-01', '2026-09-30', 1), period('2026-10-01', '2026-10-31', 0)])).toBe(
      '2026-08-31',
    );
  });

  it('stops at a gap between periods, because the days in it were never billed or collected', () => {
    expect(collectedThrough(d('2026-07-31'), [period('2026-09-01', '2026-09-30', 0)])).toBe('2026-07-31');
    expect(collectedThrough(null, [period('2026-08-01', '2026-08-31', 0), period('2026-09-02', '2026-09-30', 0)])).toBe('2026-08-31');
  });

  it('skips drafts and voided invoices, which bill nothing', () => {
    const billed = [
      period('2026-08-01', '2026-08-31', 0),
      period('2026-09-01', '2026-09-30', 9_000_000, 'void'),
      period('2026-09-01', '2026-09-30', 0),
      period('2026-10-01', '2026-10-31', 0, 'draft'),
    ];
    expect(collectedThrough(null, billed)).toBe('2026-09-30');
  });

  it('counts the paid days a prorated period adds past the activation date and ignores periods it already covers', () => {
    expect(collectedThrough(d('2026-10-20'), [period('2026-10-01', '2026-10-20', 0), period('2026-10-21', '2026-10-31', 0)])).toBe('2026-10-31');
  });
});
