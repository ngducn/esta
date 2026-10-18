import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NATIONAL_ID_VECTORS } from './national-id-vectors';
import { DATE, reduceNationalIds } from './reduce-national-ids';

const leaf = (value: unknown) => ({ value, confidence: 0.95, page: 1 });
const NBSP = ' ';

/** Every run of nine or more digits left in the output, separators included, so a test names exactly what leaked. */
function leftovers(value: unknown): string[] {
  const runs = JSON.stringify(value)
    .replace(/\\n/g, ' ')
    .match(/\p{Nd}(?:[\s.\-/]{0,3}\p{Nd})+/gu);
  return (runs ?? []).filter((run) => run.replace(/\D/gu, '').length >= 9);
}

describe('reduceNationalIds', () => {
  it('keeps the last four digits of a 12-digit CCCD in id_last4', () => {
    const reduced = reduceNationalIds({ holders: [{ full_name: leaf('Phạm Minh Demo'), id_last4: leaf('079062118340') }] });
    expect(reduced.holders[0]?.id_last4.value).toBe('8340');
  });

  it('keeps the last four digits of a 9-digit CMND printed after its label, and fills an empty id_last4', () => {
    const reduced = reduceNationalIds({
      holders: [{ id_last4: leaf(null), address_text: leaf('CMND số 024 518 377, cấp tại TP. Hồ Chí Minh') }],
    });
    expect(reduced.holders[0]?.address_text.value).toBe('CMND số 8377, cấp tại TP. Hồ Chí Minh');
    expect(reduced.holders[0]?.id_last4.value).toBe('8377');
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

  it.each([
    ['a date after the number', 'CCCD số 012345678901 12/03/2021', 'CCCD số 8901 12/03/2021'],
    ['a year after a CMND', 'CMND 123456789 2015', 'CMND 6789 2015'],
    ['a date after a CMND', 'CMND 123456789 15/03/2015', 'CMND 6789 15/03/2015'],
    ['a comma and the year', 'CCCD 012345678901, cấp 2021', 'CCCD 8901, cấp 2021'],
    ['a newline after the label', 'Số CCCD:\n079062118340', 'Số CCCD:\n8340'],
    ['a newline and spaces after the label', 'CCCD: \n 012345678901', 'CCCD: \n 8901'],
    ['NBSP grouping', `CCCD 079${NBSP}062${NBSP}118${NBSP}340`, 'CCCD 8340'],
    ['double space grouping', 'CCCD 079  062  118  340', 'CCCD 8340'],
    ['space grouping', 'CCCD: 012 345 678 901', 'CCCD: 8901'],
    ['dot grouping', 'CCCD 079.062.118.340', 'CCCD 8340'],
    ['dash grouping', 'CCCD 079-062-118-340', 'CCCD 8340'],
    ['slash grouping after a label', 'CCCD 079/062/118/340', 'CCCD 8340'],
    ['a number split over two lines after a label', 'CCCD 012345\n678901', 'CCCD 8901'],
    ['digits spaced one by one', 'CCCD số 0 1 2 3 4 5 6 7 8 9 0 1 2', 'CCCD số 8901 2'],
    ['a parenthetical with a year before the number', 'CCCD (cấp 2021): 079062118340', 'CCCD (cấp 2021): 8340'],
    ['a long gap after the label', 'CCCD do Cục Cảnh sát QLHC về TTXH cấp số 079062118340', 'CCCD do Cục Cảnh sát QLHC về TTXH cấp số 8340'],
    ['the number in parentheses', 'CCCD (012345678901)', 'CCCD (8901)'],
    ['CMT', 'CMT số 024518377 cấp ngày 01/02/2003', 'CMT số 8377 cấp ngày 01/02/2003'],
    ['Chứng minh thư', 'Chứng minh thư số 024518377', 'Chứng minh thư số 8377'],
    ['Mã định danh', 'Mã định danh: 079062118340', 'Mã định danh: 8340'],
    ['Số ĐDCN', 'Số ĐDCN: 012345678901', 'Số ĐDCN: 8901'],
    ['ID No.', 'ID No. 012345678901', 'ID No. 8901'],
    ['Citizen ID', 'Citizen ID 012345678901', 'Citizen ID 8901'],
    ['Số thẻ', 'Số thẻ: 012345678901', 'Số thẻ: 8901'],
    ['Số alone', 'Số: 012345678901', 'Số: 8901'],
    ['MST, which a personal tax code now shares with the CCCD', 'MST: 079062118340', 'MST: 8340'],
    ['a CCCD and a CMND split by a slash', 'CCCD/CMND: 012345678901/123456789', 'CCCD/CMND: 8901/6789'],
    ['a CCCD and a CMND with two labels', 'CCCD: 012345678901 - CMND: 123456789', 'CCCD: 8901 - CMND: 6789'],
    ['a CCCD and a CMND joined by và', 'CCCD 012345678901 và 123456789', 'CCCD 8901 và 6789'],
    ['the label in capitals', 'CĂN CƯỚC CÔNG DÂN 012345678901', 'CĂN CƯỚC CÔNG DÂN 8901'],
    ['Căn cước', 'Căn cước 012345678901', 'Căn cước 8901'],
    ['the label in lower case', 'số cccd 012345678901', 'số cccd 8901'],
    ['a misspelt số', 'CCCD sô 012345678901', 'CCCD sô 8901'],
    ['a sentence after the number', 'CCCD: 012 345 678 901. Hộ khẩu 12', 'CCCD: 8901. Hộ khẩu 12'],
    ['the label glued to the number', 'CCCD012345678901', 'CCCD8901'],
    ['full-width digits', 'CCCD ０７９０６２１１８３４０', 'CCCD 8340'],
    ['no label at all', '012345678901 Đường A', '8901 Đường A'],
  ])('reduces an ID with %s', (_name, text, reduced) => {
    expect(reduceNationalIds({ notes_text: leaf(text) }).notes_text.value).toBe(reduced);
  });

  it.each([
    ['a phone number and a 9-digit parcel number with no ID label', 'Liên hệ 0903123456, thửa số 123456789 tờ bản đồ 5'],
    ['a grouped phone number', 'SĐT 0903 123 456'],
    ['an electricity customer code', 'Mã KH: PE01234567890'],
    ['a customer code with twelve digits after its letters', 'Mã KH: PE012345678901'],
    ['a date with slashes', 'Ngày 12/03/2021'],
    ['an ISO date', 'Ngày 2021-03-12'],
    ['a date with dots', 'Ngày 12.03.2021'],
    ['a range of dates', 'Thế chấp từ 12/03/2021 - 15/04/2022'],
    ['an amount', 'Tổng cộng tiền thanh toán: 1.234.764 đ'],
    ['a 12-digit amount in đồng', 'Giá chuyển nhượng 125.000.000.000 đồng'],
    ['a 13-digit amount', 'Giá trị 1.250.000.000.000'],
    ['a 13-digit bank account', 'STK 0123456789012'],
    ['meter readings on separate lines', '\n12480\n12892\n412\n2.997 đ\n1.234.764 đ\n'],
    ['a serial number', 'Số phát hành AA 01234567'],
  ])('leaves %s intact', (_name, text) => {
    expect(reduceNationalIds({ notes_text: leaf(text) }).notes_text.value).toBe(text);
  });

  it.each([
    ['12 digits', '012345678901'],
    ['spaces', '012 345 678 901'],
    ['dots', '012.345.678.901'],
    ['dashes', '012-345-678-901'],
    ['a CMND', '123456789'],
    ['a CMND with spaces', '123 456 789'],
    ['padding', ' 012345678901 '],
    ['a prefix', 'ID 012345678901'],
    ['a label', 'CCCD: 012345678901'],
    ['a full stop', '012345678901.'],
    ['a newline', '012345678901\n'],
    ['full-width digits', '０１２３４５６７８９０１'],
  ])('keeps four digits when id_last4 holds a full number with %s', (_name, value) => {
    const reduced = reduceNationalIds({ holders: [{ id_last4: leaf(value) }] });
    expect(reduced.holders[0]?.id_last4.value).toMatch(/^\d{4}$/);
  });

  it.each([
    ['full_name', { holders: [{ full_name: leaf('Nguyễn Văn Demo 012345678901'), id_last4: leaf('8901') }] }],
    ['full_name after a label', { holders: [{ full_name: leaf('Nguyễn Văn Demo CCCD 012345678901') }] }],
    ['address_text', { holders: [{ address_text: leaf('12 Đường A, CCCD 012345678901') }] }],
    ['address_text with a name', { holders: [{ id_last4: leaf(null), address_text: leaf('Phạm Minh Demo 079062118340, 12 Lê Lợi') }] }],
    ['relation', { holders: [{ relation: leaf('Vợ, CMND số 123456789') }] }],
    ['an annotation', { annotations: [{ text: leaf('Bán cho ông A\nCCCD: 012345678901 cấp 2021') }] }],
    ['serial_no', { serial_no: leaf('012345678901') }],
    ['holder_name of a bill', { holder_name: leaf('Demo 012345678901') }],
    ['customer_code of a bill', { customer_code: leaf('012345678901') }],
    ['bare full_text', { full_text: 'KH: Demo\n012345678901\n' }],
    ['full_text with a label and a newline', { full_text: 'Khách hàng\nCCCD:\n012345678901\nĐịa chỉ' }],
    ['full_text with a grouped number', { full_text: 'CCCD: 012 345 678 901' }],
    ['a key named id_number', { id_number: leaf('012345678901') }],
    ['a key named cccd', { cccd: '012345678901' }],
    ['an array under national_id', { national_id: ['012345678901'] }],
    ['a key named holder_id_no', { holder_id_no: leaf('012345678901') }],
    ['a key named idno', { idno: leaf('012345678901') }],
    ['a key named identity_number', { identity_number: leaf('012345678901') }],
    ['an extra key beside a leaf value', { id_last4: { value: '012345678901', confidence: 1, page: 1, extra: '012345678901' } }],
    ['a leaf without confidence', { holders: [{ id_last4: { value: '012345678901' } }] }],
  ])('leaves no full ID in %s', (_name, input) => {
    expect(leftovers(reduceNationalIds(input))).toEqual([]);
  });

  it('fills an empty id_last4 from an unlabelled number in the same holder', () => {
    const reduced = reduceNationalIds({ holders: [{ id_last4: leaf(null), address_text: leaf('Phạm Minh Demo 079062118340, 12 Lê Lợi') }] });
    expect(reduced.holders[0]).toEqual({ id_last4: leaf('8340'), address_text: leaf('Phạm Minh Demo 8340, 12 Lê Lợi') });
  });

  it('reads each string on its own, so six digits in each of two fields stay', () => {
    const input = { holders: [{ full_name: leaf('Demo 012345'), address_text: leaf('678901') }] };
    expect(reduceNationalIds(input)).toEqual(input);
  });

  it.each(NATIONAL_ID_VECTORS.reduced)('reduces the shared vector %s, and reducing again changes nothing', (_name, text, reduced) => {
    const once = reduceNationalIds({ notes_text: leaf(text) }).notes_text.value;
    expect(once).toBe(reduced);
    expect(reduceNationalIds({ notes_text: leaf(once) }).notes_text.value).toBe(reduced);
  });

  it.each(NATIONAL_ID_VECTORS.kept)('keeps the shared vector %s', (_name, text) => {
    expect(reduceNationalIds({ notes_text: leaf(text) }).notes_text.value).toBe(text);
  });

  it('never lets a 12-digit run with any separators through, unless its grouping reads as a date', () => {
    const separator = fc.constantFrom('', ' ', '  ', NBSP, ' ', '\t', '.', '-');
    const run = fc
      .tuple(fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 12, maxLength: 12 }), fc.array(separator, { minLength: 11, maxLength: 11 }))
      .map(([digits, separators]) => digits.map((digit, i) => `${digit}${separators[i] ?? ''}`).join(''));
    const context = fc.constantFrom(['', ''], ['Ông Demo ', ', 12 Lê Lợi'], ['CCCD: ', ''], ['Số ', ' cấp 12/03/2021'], ['(', ')'], ['\n', '\n']);
    fc.assert(
      fc.property(run, context, fc.boolean(), (number, [before, after], asLeaf) => {
        fc.pre(!new RegExp(DATE.source, 'u').test(number));
        const text = `${before}${number}${after}`;
        const reduced = reduceNationalIds(asLeaf ? { notes_text: leaf(text) } : { full_text: text });
        const out = asLeaf ? (reduced as { notes_text: { value: string } }).notes_text.value : (reduced as { full_text: string }).full_text;
        expect(out.replace(/\D/g, '')).not.toContain(number.replace(/\D/g, ''));
        expect(out).toContain(number.replace(/\D/g, '').slice(-4));
      }),
      { numRuns: 2000 },
    );
  });
});
