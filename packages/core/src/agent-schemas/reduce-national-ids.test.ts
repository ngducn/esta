import { describe, expect, it } from 'vitest';
import { reduceNationalIds } from './reduce-national-ids';

const leaf = (value: unknown) => ({ value, confidence: 0.95, page: 1 });

describe('reduceNationalIds', () => {
  it('keeps the last four digits of a 12-digit CCCD in id_last4', () => {
    const reduced = reduceNationalIds({ holders: [{ full_name: leaf('Phạm Minh Demo'), id_last4: leaf('079062118340') }] });
    expect(reduced.holders[0]?.id_last4.value).toBe('8340');
    expect(JSON.stringify(reduced)).not.toMatch(/\d{9}/);
  });

  it('keeps the last four digits of a 9-digit CMND printed after its label, and fills an empty id_last4', () => {
    const reduced = reduceNationalIds({
      holders: [{ id_last4: leaf(null), address_text: leaf('CMND số 024 518 377, cấp tại TP. Hồ Chí Minh') }],
    });
    expect(reduced.holders[0]?.address_text.value).toBe('CMND số 8377, cấp tại TP. Hồ Chí Minh');
    expect(reduced.holders[0]?.id_last4.value).toBe('8377');
  });

  it('leaves a phone number and other numbers intact', () => {
    const input = { notes_text: leaf('Liên hệ 0903123456, thửa số 123456789 tờ bản đồ 5'), phone: '0903 123 456' };
    expect(reduceNationalIds(input)).toEqual(input);
  });

  it('reduces an ID inside notes_text after số định danh and CCCD', () => {
    const reduced = reduceNationalIds({ notes_text: leaf('Số định danh cá nhân: 079165220913; CCCD 074171035582') });
    expect(reduced.notes_text.value).toBe('Số định danh cá nhân: 0913; CCCD 5582');
  });

  it('reduces the plain string full_text of a bill, decomposed or not', () => {
    const reduced = reduceNationalIds({ full_text: 'Khách hàng Demo, căn cước công dân 079084301776'.normalize('NFD') });
    expect(reduced.full_text).toBe('Khách hàng Demo, căn cước công dân 1776'.normalize('NFC'));
  });

  it('does not change its input', () => {
    const input = { id_last4: leaf('079062118340') };
    reduceNationalIds(input);
    expect(input.id_last4.value).toBe('079062118340');
  });
});
