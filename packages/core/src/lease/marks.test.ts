import { describe, expect, it } from 'vitest';
import { isoDate as d } from '../date/iso-date';
import { unitLeaseMark } from './marks';

const asOf = d('2026-10-07');

describe('unitLeaseMark', () => {
  it('marks Dĩ An Phòng 5 overdue 12 days by its oldest open invoice, due 2026-09-25', () => {
    expect(unitLeaseMark({ status: 'active', openDueDates: [d('2026-10-25'), d('2026-09-25')] }, asOf)).toEqual({ kind: 'overdue', days: 12, dueDate: '2026-09-25' });
  });

  it('marks an invoice due today as due and a later one as upcoming', () => {
    expect(unitLeaseMark({ status: 'active', openDueDates: [asOf] }, asOf)).toEqual({ kind: 'due', dueDate: asOf });
    expect(unitLeaseMark({ status: 'active', openDueDates: [d('2026-10-25')] }, asOf)).toEqual({ kind: 'upcoming', dueDate: '2026-10-25' });
  });

  it('reads an active lease with nothing open as clear', () => {
    expect(unitLeaseMark({ status: 'active', openDueDates: [] }, asOf)).toEqual({ kind: 'clear' });
  });

  it('marks a terminated lease still running by its invoices, a draft as draft, and no lease as vacant', () => {
    expect(unitLeaseMark({ status: 'terminated', openDueDates: [d('2026-10-25')] }, asOf)).toEqual({ kind: 'upcoming', dueDate: '2026-10-25' });
    expect(unitLeaseMark({ status: 'draft', openDueDates: [] }, asOf)).toEqual({ kind: 'draft' });
    expect(unitLeaseMark(undefined, asOf)).toEqual({ kind: 'vacant' });
  });
});
