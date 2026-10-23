import { describe, expect, it } from 'vitest';
import { isoDate } from '@esta/core/date';
import { vnd } from '@esta/core/money';
import { readDraft, withContract, type LeaseFormValues } from './lease-form-values';

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

describe('withContract', () => {
  it('fills what the contract said, reads back as the same draft, and names each filled field', () => {
    const ROOM = '7a0f6e43-6f1a-4f43-9d6b-2f7f5c1d2e08';
    const TENANT = '7a0f6e43-6f1a-4f43-9d6b-2f7f5c1d2e99';
    const terms = { unit_id: ROOM, start_date: isoDate('2026-10-15'), end_date: isoDate('2027-10-14'), rent_vnd: vnd(3_500_000), billing_cycle_months: 3 as const, deposit_vnd: vnd(7_000_000) };
    const filled = withContract(values, terms, TENANT);
    expect(filled.prefilled.toSorted()).toEqual(['cycle', 'depositText', 'endText', 'rentText', 'startText', 'tenantId', 'unitId']);
    const draft = readDraft(filled.values);
    expect(draft.ok && draft.value).toMatchObject({ unit_id: ROOM, tenant_party_id: TENANT, start_date: '2026-10-15', end_date: '2027-10-14', rent_vnd: 3_500_000, billing_cycle_months: 3, deposit_vnd: 7_000_000 });
  });

  it('leaves every field the contract did not fill as it was', () => {
    expect(withContract(values, {}, null)).toEqual({ values, prefilled: [] });
  });
});
