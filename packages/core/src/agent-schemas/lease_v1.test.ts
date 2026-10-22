import { describe, expect, it } from 'vitest';
import { leaseV1Schema } from './lease_v1';

const leaf = (value: unknown) => ({ value, confidence: 0.95, page: 1 });

const lease = {
  tenant_name: leaf('Lê Văn Demo'),
  tenant_phone: leaf('0903 123 456'),
  tenant_id_last4: leaf('6789'),
  property_address: leaf('Số 12 đường Demo, phường Dĩ An, TP. Dĩ An, Bình Dương'),
  unit_label: leaf('Phòng 8'),
  start_date: leaf('2026-10-15'),
  end_date: leaf('2027-10-14'),
  term_months: leaf(12),
  rent_vnd: leaf(3_500_000),
  billing_cycle_months: leaf(1),
  due_day: leaf(5),
  deposit_vnd: leaf(3_500_000),
  notes: leaf('Điện 3.500 đ/kWh, nước 100.000 đ/người.'),
};

describe('leaseV1Schema', () => {
  it('accepts a lease without full_text and one with it', () => {
    expect(leaseV1Schema.safeParse(lease).success).toBe(true);
    expect(leaseV1Schema.parse({ ...lease, full_text: 'HỢP ĐỒNG THUÊ PHÒNG' }).full_text).toBe('HỢP ĐỒNG THUÊ PHÒNG');
  });

  it('reads printed rent and deposit as whole đồng', () => {
    const parsed = leaseV1Schema.parse({ ...lease, rent_vnd: leaf('3.500.000 đ'), deposit_vnd: leaf('7.000.000 đồng') });
    expect(parsed.rent_vnd.value).toBe(3_500_000);
    expect(parsed.deposit_vnd.value).toBe(7_000_000);
  });

  it('accepts every value as absent', () => {
    const empty = Object.fromEntries(Object.keys(lease).map((key) => [key, { value: null, confidence: 0, page: null }]));
    expect(leaseV1Schema.safeParse(empty).success).toBe(true);
  });

  it('keeps only the last four digits of the tenant ID (SPEC D11)', () => {
    expect(leaseV1Schema.safeParse({ ...lease, tenant_id_last4: leaf('079062118340') }).success).toBe(false);
    expect(leaseV1Schema.safeParse({ ...lease, tenant_id_last4: leaf('8340') }).success).toBe(true);
  });

  it('rejects a cycle the lease form cannot bill, a date that is not ISO, a fractional rent and a due day past 31', () => {
    expect(leaseV1Schema.safeParse({ ...lease, billing_cycle_months: leaf(2) }).success).toBe(false);
    expect(leaseV1Schema.safeParse({ ...lease, start_date: leaf('15/10/2026') }).success).toBe(false);
    expect(leaseV1Schema.safeParse({ ...lease, rent_vnd: leaf(3_500_000.5) }).success).toBe(false);
    expect(leaseV1Schema.safeParse({ ...lease, due_day: leaf(32) }).success).toBe(false);
  });

  it('rejects an ID number hidden in an amount or the term, because both are bounded', () => {
    expect(leaseV1Schema.safeParse({ ...lease, deposit_vnd: leaf(999_999_999) }).success).toBe(true);
    expect(leaseV1Schema.safeParse({ ...lease, rent_vnd: leaf(79_062_118_340) }).success).toBe(false);
    expect(leaseV1Schema.safeParse({ ...lease, deposit_vnd: leaf(79_062_118_340) }).success).toBe(false);
    expect(leaseV1Schema.safeParse({ ...lease, term_months: leaf(79_062_118_340) }).success).toBe(false);
  });
});
