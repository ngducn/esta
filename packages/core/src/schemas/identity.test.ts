import { describe, expect, it } from 'vitest';
import { UNIDENTIFIED } from './identity';
import { newLeaseDraftSchema } from './lease';
import { newCertificateSchema } from './legal';
import { newUtilityAccountSchema } from './units';

const unit = '7a1c2e3f-4a5b-5c6d-8e7f-8091a2b3c4d5';
const tenant = '0c1d2e3f-4a5b-5c6d-8e7f-8091a2b3c4d5';

const refusal = (result: { success: boolean; error?: { issues: readonly { message: string }[] } }) =>
  result.success ? null : result.error?.issues.map((issue) => issue.message);

describe('a new certificate needs a serial, a book entry, an issue date or a holder (#356)', () => {
  // What `Thêm giấy chứng nhận` sends when Mẹ taps Lưu without typing: the form and status it opens with.
  const blank = { form: 'gcn_2009_2024', serial_no: '', book_entry_no: '', issued_on: null, issued_by: '', holder_party_ids: [], status: 'valid', mortgage: null, annotations: [] };

  it('refuses the blank form, and an issuer or a note alone', () => {
    expect(refusal(newCertificateSchema.safeParse(blank))).toEqual([UNIDENTIFIED]);
    expect(refusal(newCertificateSchema.safeParse({ ...blank, serial_no: '   ', issued_by: 'Sở Tài nguyên và Môi trường tỉnh Bình Dương' }))).toEqual([UNIDENTIFIED]);
    expect(refusal(newCertificateSchema.safeParse({ ...blank, annotations: [{ text: 'Chuyển nhượng' }] }))).toEqual([UNIDENTIFIED]);
  });

  it.each([
    ['a serial', { serial_no: 'DA 903003' }],
    ['a book entry', { book_entry_no: 'CS 01234' }],
    ['an issue date', { issued_on: '2015-03-02' }],
    ['a holder', { holder_party_ids: [tenant] }],
  ])('accepts one with only %s', (_, fields) => {
    expect(newCertificateSchema.safeParse({ ...blank, ...fields }).success).toBe(true);
  });
});

describe('a new utility account needs a provider, a customer code or a holder (#356)', () => {
  const blank = { kind: 'electricity', provider: '', customer_code: '', holder_name: '', unit_id: null, note: '' };

  it('refuses the blank form, and a room or a note alone', () => {
    expect(refusal(newUtilityAccountSchema.safeParse(blank))).toEqual([UNIDENTIFIED]);
    expect(refusal(newUtilityAccountSchema.safeParse({ ...blank, unit_id: unit, note: 'Công tơ tầng trệt' }))).toEqual([UNIDENTIFIED]);
  });

  it.each([
    ['a provider', { provider: 'Điện lực Demo Biên Hòa' }],
    ['a customer code', { customer_code: 'PK0905000005' }],
    ['a holder', { holder_name: 'Nguyễn Thị Demo' }],
  ])('accepts one with only %s', (_, fields) => {
    expect(newUtilityAccountSchema.safeParse({ ...blank, ...fields }).success).toBe(true);
  });
});

describe('a new lease draft needs a tenant or a start date (#356)', () => {
  // The room and the list rent and deposit the form opens with for Phòng 8.
  const blank = {
    unit_id: unit,
    tenant_party_id: null,
    start_date: null,
    end_date: null,
    rent_vnd: 3_000_000,
    billing_cycle_months: 1,
    period_anchor: 'lease_start',
    first_period_proration: 'none',
    deposit_vnd: 3_000_000,
    escalation: { kind: 'none' },
    utilities_mode: 'metered_by_owner',
    tax_payer: 'owner',
    notice_days: 30,
  };

  it('refuses a draft with only the room and the terms it opened with', () => {
    expect(refusal(newLeaseDraftSchema.safeParse(blank))).toEqual([UNIDENTIFIED]);
    expect(refusal(newLeaseDraftSchema.safeParse({ ...blank, end_date: '2027-10-31' }))).toEqual([UNIDENTIFIED]);
  });

  it.each([
    ['a tenant', { tenant_party_id: tenant }],
    ['a start date', { start_date: '2026-11-01' }],
  ])('accepts one with only %s', (_, fields) => {
    expect(newLeaseDraftSchema.safeParse({ ...blank, ...fields }).success).toBe(true);
  });
});
