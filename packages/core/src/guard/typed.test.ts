import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { extractTypedNumbers, extractTypedNumbersFrom } from './typed';

const kinds = (text: string) => extractTypedNumbers(text).map((n) => n.typed);

describe('extractTypedNumbers', () => {
  it('reads 4tr as 4.000.000 ₫', () => {
    expect(kinds('lên 4tr')).toEqual([{ kind: 'vnd', value: vnd(4_000_000) }]);
  });
  it('reads 3,5tr as 3.500.000 ₫', () => {
    expect(kinds('giá 3,5tr')).toEqual([{ kind: 'vnd', value: vnd(3_500_000) }]);
  });
  it('reads 3tr5 and 850k', () => {
    expect(kinds('3tr5 và 850k')).toEqual([
      { kind: 'vnd', value: vnd(3_500_000) },
      { kind: 'vnd', value: vnd(850_000) },
    ]);
  });
  it('reads 2 tỷ with its typed text and display', () => {
    const [n] = extractTypedNumbers('Vay 2 tỷ trong');
    expect(n).toMatchObject({ typed: { kind: 'vnd', value: 2_000_000_000 }, typed_text: '2 tỷ' });
    expect(n?.value_display).toBe('2.000.000.000\u00a0₫');
  });
  it('reads 9%/năm as 900 bp and skips a monthly rate', () => {
    expect(kinds('lãi 9%/năm')).toEqual([{ kind: 'bp', value: 900 }]);
    expect(kinds('lãi 1%/tháng')).toEqual([{ kind: 'bp', value: 100, per: 'month' }]);
  });
  it('reads 07/10/2026', () => {
    expect(kinds('ngày 07/10/2026')).toEqual([{ kind: 'date', value: isoDate('2026-10-07') }]);
  });
  it('reads 15 năm as 180 months and 8 phòng as a count', () => {
    expect(kinds('trong 15 năm')).toEqual([{ kind: 'months', value: 180 }]);
    expect(kinds('có 8 phòng')).toEqual([{ kind: 'count', value: 8, unit: 'phòng' }]);
  });
  it('reads phòng 2 as a label', () => {
    expect(kinds('tăng tiền phòng 2 ở Dĩ An lên 4tr')).toEqual([{ kind: 'vnd', value: vnd(4_000_000) }]);
  });
  it('does not read a phone number or a bare number', () => {
    expect(kinds('gọi 0901234567 hoặc 090.123.456, số 12')).toEqual([]);
  });
  it('reads a dotted amount but not a date as an amount', () => {
    expect(kinds('thu 1.200.000 ₫')).toEqual([{ kind: 'vnd', value: vnd(1_200_000) }]);
    expect(kinds('10.12.2024')).toEqual([{ kind: 'date', value: isoDate('2024-12-10') }]);
  });
  it('reads every message she wrote, not only the last', () => {
    const all = extractTypedNumbersFrom(['Lúc mua là 1,2 tỷ', 'còn 9%/năm thì sao']);
    expect(all.map((n) => n.typed)).toEqual([
      { kind: 'vnd', value: 1_200_000_000 },
      { kind: 'bp', value: 900 },
    ]);
  });
  it('keeps the words of an answer out: only the strings given are read', () => {
    expect(extractTypedNumbersFrom(['Phòng 2 thu 3tr'])).toHaveLength(1);
  });
  // Fix round 1 (audit B1 to B4)

  it('reads a spaced trailing part the way parseVndInput does', () => {
    expect(kinds('1 tỷ 2')).toEqual([{ kind: 'vnd', value: vnd(1_200_000_000) }]);
    expect(kinds('3 triệu 5')).toEqual([{ kind: 'vnd', value: vnd(3_500_000) }]);
    expect(kinds('2 tỷ 5')).toEqual([{ kind: 'vnd', value: vnd(2_500_000_000) }]);
  });
  it('B2 reads a date written in words as one date, not as durations', () => {
    expect(kinds('ngày 7 tháng 10 năm 2026')).toEqual([{ kind: 'date', value: isoDate('2026-10-07') }]);
  });
  it('B2 still reads a count after a number and its own unit', () => {
    expect(kinds('3 phòng 2 tháng')).toEqual([
      { kind: 'count', value: 3, unit: 'phòng' },
      { kind: 'months', value: 2 },
    ]);
  });
  it('B3 does not read an area or a dotted count as đồng', () => {
    expect(kinds('đất 1.500 m2')).toEqual([]);
    expect(kinds('diện tích 1.200 m²')).toEqual([]);
    expect(kinds('1.000 người')).not.toContainEqual({ kind: 'vnd', value: vnd(1000) });
  });
  it('B4 reads an undotted amount with a currency mark', () => {
    expect(kinds('2000000đ')).toEqual([{ kind: 'vnd', value: vnd(2_000_000) }]);
    expect(kinds('2000000 đồng')).toEqual([{ kind: 'vnd', value: vnd(2_000_000) }]);
  });

  it('reads 2 tỷ 5 and 3 tr 5 and 3tr5 and 1 tỷ 200 as the spoken shorthand', () => {
    expect(kinds('3 tr 5')).toEqual([{ kind: 'vnd', value: vnd(3_500_000) }]);
    expect(kinds('3tr5')).toEqual([{ kind: 'vnd', value: vnd(3_500_000) }]);
    expect(kinds('1 tỷ 200')).toEqual([{ kind: 'vnd', value: vnd(1_200_000_000) }]);
  });
  it('reads 1 năm rưỡi as 18 months', () => {
    expect(kinds('vay 1 năm rưỡi')).toEqual([{ kind: 'months', value: 18 }]);
    expect(kinds('2 năm rưỡi')).toEqual([{ kind: 'months', value: 30 }]);
  });
  it('reads tháng 10 năm 2026 as labels', () => {
    expect(kinds('tháng 10 năm 2026')).toEqual([]);
  });
  it('does not read a dotted id or a non-money unit as đồng', () => {
    expect(kinds('mã 123.456.789.012')).toEqual([]);
    expect(kinds('lô đất 1.000 m2 giá 15tr/m2')).toEqual([{ kind: 'vnd', value: vnd(15_000_000) }]);
  });
  it('reads 2.000.000 VND', () => {
    expect(kinds('2.000.000 VND')).toEqual([{ kind: 'vnd', value: vnd(2_000_000) }]);
  });
  it('B1 skips a monthly rate however it is written, and still reads a yearly one', () => {
    for (const text of ['lãi 0,8% một tháng', 'lãi 0,8% mỗi tháng', 'lãi 0,8% tháng', 'lãi 0,8%/tháng', 'lãi 0,8 % / tháng', 'lãi 0,8 phần trăm một tháng', 'Lãi 0,8% Tháng']) {
      expect(kinds(text), text).toEqual([{ kind: 'bp', value: 80, per: 'month' }]);
    }
    for (const text of ['lãi 9%/năm', 'lãi 9% một năm', 'lãi 9% mỗi năm', 'lãi 9% năm', 'lãi 9 phần trăm một năm']) {
      expect(kinds(text), text).toEqual([{ kind: 'bp', value: 900 }]);
    }
  });
  it('B1 still reads a rate that a loan term follows', () => {
    expect(kinds('lãi 9% trong 15 năm')).toEqual([{ kind: 'bp', value: 900 }, { kind: 'months', value: 180 }]);
  });
  it('L1 reads a street or a property name as a label, not as her numbers', () => {
    expect(kinds('nhà ở đường 3 tháng 2')).toEqual([]);
    expect(kinds('nhà ở đường 30 tháng 4 giá 4tr')).toEqual([{ kind: 'vnd', value: vnd(4_000_000) }]);
    expect(kinds('Căn hộ 2 phòng ngủ')).toEqual([]);
    expect(kinds('thuê 2 phòng ngủ')).toEqual([]);
  });
  it('B1b reads a percent as a yearly rate only beside a year marker, whatever other period word is written', () => {
    const monthly = ['lãi 0,8% hàng tháng', 'lãi 0,8% theo tháng', 'lãi 0,8% trên tháng', 'lãi 0,8%/th', 'lãi 0,8%/mỗi tháng', 'lãi 0,8%/1 tháng', 'lãi suất tháng 0,8%', 'lãi tháng là 0,8%', 'lãi 0,8% một tháng', 'interest 0,8% a month', 'interest 0,8%/month'];
    for (const text of monthly) expect(kinds(text), text).toEqual([{ kind: 'bp', value: 80, per: 'month' }]);
    const none = ['lãi 0,8% một quý', 'lãi 4,8% nửa năm', 'lãi 9%', 'lãi 9% thì sao'];
    for (const text of none) expect(kinds(text), text).toEqual([]);
    const yearly = ['lãi 9% hàng năm', 'lãi 9% trên năm', 'lãi 9% theo năm', 'lãi 9%/năm', 'lãi suất năm 9%', 'lãi suất năm là 9%', 'interest 9% a year', 'interest 9% per year', 'interest 9%/year', 'interest 9% p.a.'];
    for (const text of yearly) expect(kinds(text), text).toEqual([{ kind: 'bp', value: 900 }]);
  });
  it('B1b leaves a percent unread beside a year marker that a combining mark continues (CI seed -1581416164)', () => {
    for (const text of ['lãi 0,8% nam\u0DC7a', 'nam\u0DC7a 0,8%', 'lãi 0,8%/nam\u0DC7a', 'lãi 0,8% th\u0301a'])
      expect(kinds(text).filter((n) => n.kind === 'bp'), text).toEqual([]);
  });
  it('B1b property: a percent next to any word outside the year and month lists never yields a rate', () => {
    const MARKERS = new Set(['năm', 'nam', 'year', 'tháng', 'thang', 'th', 'month']);
    const word = fc.stringMatching(/^[a-zà-ỹ]{1,8}$/u).filter((w) => !MARKERS.has(w) && w !== 'trong');
    fc.assert(
      fc.property(word, fc.constantFrom('0,8%', '12 phần trăm', '4,8 %'), (w, pct) => {
        for (const text of [`lãi ${pct} ${w}`, `lãi ${pct}/${w}`, `${w} ${pct}`, `lãi ${w} ${pct} thì sao`]) {
          expect(kinds(text).filter((n) => n.kind === 'bp'), text).toEqual([]);
        }
      }),
    );
  });
});
