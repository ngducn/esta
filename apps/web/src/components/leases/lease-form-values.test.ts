import { describe, expect, it } from 'vitest';
import { readDraft, type LeaseFormValues } from './lease-form-values';

const values: LeaseFormValues = {
  unitId: '7a0f6e43-6f1a-4f43-9d6b-2f7f5c1d2e01',
  tenantId: '',
  startText: '01/08/2026',
  endText: '',
  rentText: '3.000.000',
  cycle: 1,
  anchor: 'calendar_month',
  proration: 'by_days',
  depositText: '',
  escalation: 'none',
  escalationValueText: '',
  escalationEveryText: '12',
  utilities: 'tenant_direct',
  taxPayer: 'owner',
  noticeText: '30',
};

describe('readDraft dates', () => {
  it('reads 01/08/2026 as the start and an empty end as open-ended', () => {
    const draft = readDraft(values);
    expect(draft.ok && { start: draft.value.start_date, end: draft.value.end_date }).toEqual({ start: '2026-08-01', end: null });
  });

  it('refuses an end date of 31/09/2026 instead of saving the lease open-ended', () => {
    expect(readDraft({ ...values, endText: '31/09/2026' })).toEqual({ ok: false, field: 'end' });
  });

  it('refuses a start date of 1/8 instead of saving the lease without one', () => {
    expect(readDraft({ ...values, startText: '1/8' })).toEqual({ ok: false, field: 'start' });
  });

  it('still refuses an end before the start', () => {
    expect(readDraft({ ...values, endText: '31/07/2026' })).toEqual({ ok: false, field: 'endBeforeStart' });
  });
});
