import { describe, expect, it } from 'vitest';
import { CERTIFICATE_FORMS, certificateSchema, parcelSchema, purposeSchema } from './legal';

const bank = '5f2b7c1e-0b7a-5c39-9d0e-2a4b6c8d0e1f';
const holder = '0c1d2e3f-4a5b-5c6d-8e7f-8091a2b3c4d5';

const certificate = (overrides: Record<string, unknown> = {}) => ({
  form: 'gcn_2009_2024',
  serial_no: 'BĐ 123456',
  book_entry_no: null,
  issued_on: '2015-03-02',
  issued_by: 'UBND tỉnh Lâm Đồng',
  holder_party_ids: [holder],
  status: 'valid',
  mortgage: null,
  annotations: [],
  ...overrides,
});

describe('certificateSchema', () => {
  it.each(CERTIFICATE_FORMS)('accepts the %s form', (form) => {
    expect(certificateSchema.parse(certificate({ form })).form).toBe(form);
  });

  it('accepts a mortgaged certificate carrying its open mortgage', () => {
    const parsed = certificateSchema.parse(
      certificate({ status: 'mortgaged', mortgage: { bank_party_id: bank, amount_vnd: 2_000_000_000, registered_on: '2024-05-10' } }),
    );
    expect(parsed.status === 'mortgaged' && parsed.mortgage.amount_vnd).toBe(2_000_000_000);
  });

  it('refuses mortgaged without a mortgage', () => {
    expect(certificateSchema.safeParse(certificate({ status: 'mortgaged' })).success).toBe(false);
  });

  it('refuses a mortgage amount that is not a safe integer', () => {
    for (const amount_vnd of [1.5, Number.MAX_SAFE_INTEGER + 1, -1]) {
      expect(certificateSchema.safeParse(certificate({ status: 'mortgaged', mortgage: { bank_party_id: bank, amount_vnd } })).success).toBe(false);
    }
  });

  it('keeps a released mortgage only under a status other than mortgaged', () => {
    const released = { bank_party_id: bank, amount_vnd: 0, registered_on: '2020-01-01', released_on: '2023-01-01' };
    expect(certificateSchema.safeParse(certificate({ status: 'valid', mortgage: released })).success).toBe(true);
    expect(certificateSchema.safeParse(certificate({ status: 'mortgaged', mortgage: released })).success).toBe(false);
    expect(certificateSchema.safeParse(certificate({ status: 'valid', mortgage: { bank_party_id: bank, amount_vnd: 1 } })).success).toBe(false);
  });

  it('refuses a release before the registration and a holder listed twice', () => {
    const mortgage = { bank_party_id: bank, amount_vnd: 1, registered_on: '2024-01-02', released_on: '2024-01-01' };
    expect(certificateSchema.safeParse(certificate({ mortgage })).success).toBe(false);
    expect(certificateSchema.safeParse(certificate({ holder_party_ids: [holder, holder] })).success).toBe(false);
  });
});

describe('purposeSchema', () => {
  it('accepts an unknown land use code as typed, upper-cased', () => {
    expect(purposeSchema.parse({ land_use_code: 'xyz', area_m2: 10 })).toEqual({ land_use_code: 'XYZ', area_m2: 10 });
  });

  it('accepts long_term or an end date as the term, and nothing else', () => {
    expect(purposeSchema.safeParse({ land_use_code: 'ODT', term: 'long_term' }).success).toBe(true);
    expect(purposeSchema.safeParse({ land_use_code: 'CLN', term: '2064-10-15' }).success).toBe(true);
    expect(purposeSchema.safeParse({ land_use_code: 'CLN', term: 'lâu dài' }).success).toBe(false);
    expect(purposeSchema.safeParse({ land_use_code: ' ' }).success).toBe(false);
  });
});

describe('parcelSchema', () => {
  const parcel = { certificate_id: null, parcel_no: '412', map_sheet_no: '18', area_m2: 350.5, use_form: 'private', purposes: [], origin_text: null };

  it('accepts a parcel with no number and no area', () => {
    expect(parcelSchema.parse({ ...parcel, parcel_no: '', map_sheet_no: null, area_m2: null }).parcel_no).toBeNull();
  });

  it('refuses an area with three decimals', () => {
    expect(parcelSchema.safeParse({ ...parcel, area_m2: 120.555 }).success).toBe(false);
    expect(parcelSchema.safeParse({ ...parcel, area_m2: 20.51 }).success).toBe(true);
  });
});
