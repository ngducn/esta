import { describe, expect, it } from 'vitest';
import { utilityBillV1Schema } from './utility_bill_v1';

const leaf = (value: unknown) => ({ value, confidence: 0.95, page: 1 });

const bill = {
  kind: leaf('electricity'),
  provider: leaf('Công ty Điện lực Demo'),
  customer_code: leaf('PE0100000001'),
  holder_name: leaf('Nguyễn Thị Demo'),
  address_text: leaf('12 đường Demo, phường Tân Phong, TP. Hồ Chí Minh'),
  period: leaf('2026-09'),
  amount_vnd: leaf(1_234_567),
  consumption: leaf(412),
};

describe('utilityBillV1Schema', () => {
  it('accepts a bill without full_text and one with it', () => {
    expect(utilityBillV1Schema.safeParse(bill).success).toBe(true);
    expect(utilityBillV1Schema.parse({ ...bill, full_text: 'HÓA ĐƠN TIỀN ĐIỆN' }).full_text).toBe('HÓA ĐƠN TIỀN ĐIỆN');
  });

  it('reads a printed amount and a consumption with its unit as numbers', () => {
    const parsed = utilityBillV1Schema.parse({ ...bill, amount_vnd: leaf('1.234.567 đ'), consumption: leaf('18,5 m³') });
    expect(parsed.amount_vnd.value).toBe(1_234_567);
    expect(parsed.consumption.value).toBe(18.5);
  });

  it('rejects a fractional amount, a period that is not a month and an unknown kind', () => {
    expect(utilityBillV1Schema.safeParse({ ...bill, amount_vnd: leaf(1234.5) }).success).toBe(false);
    expect(utilityBillV1Schema.safeParse({ ...bill, period: leaf('09/2026') }).success).toBe(false);
    expect(utilityBillV1Schema.safeParse({ ...bill, kind: leaf('gas') }).success).toBe(false);
  });

  it('keeps full_text out of the leaves, so the review form shows no row for it', () => {
    expect(utilityBillV1Schema.safeParse({ ...bill, full_text: leaf('x') }).success).toBe(false);
  });
});
