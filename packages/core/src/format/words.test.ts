import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_VND, vnd } from '../money/vnd';
import { vndInWords } from './words';

describe('vndInWords', () => {
  it.each([
    [0, 'Không đồng'],
    [15, 'Mười lăm đồng'],
    [21, 'Hai mươi mốt đồng'],
    [105, 'Một trăm lẻ năm đồng'],
    [104, 'Một trăm lẻ bốn đồng'],
    [101, 'Một trăm lẻ một đồng'],
    [14, 'Mười bốn đồng'],
    [24, 'Hai mươi bốn đồng'],
    [111, 'Một trăm mười một đồng'],
    [3_500_000, 'Ba triệu năm trăm nghìn đồng'],
    [15_500_000, 'Mười lăm triệu năm trăm nghìn đồng'],
    [1_005_000, 'Một triệu không trăm lẻ năm nghìn đồng'],
    [2_105_000, 'Hai triệu một trăm lẻ năm nghìn đồng'],
    [1_001_001_001, 'Một tỷ không trăm lẻ một triệu không trăm lẻ một nghìn không trăm lẻ một đồng'],
    [605_000_000, 'Sáu trăm lẻ năm triệu đồng'],
    [15_000_000, 'Mười lăm triệu đồng'],
    [21_000_000, 'Hai mươi mốt triệu đồng'],
    [25_000, 'Hai mươi lăm nghìn đồng'],
    [1_000_025, 'Một triệu không trăm hai mươi lăm đồng'],
    [500_000_000, 'Năm trăm triệu đồng'],
    [600_000_000, 'Sáu trăm triệu đồng'],
    [1_250_000_000, 'Một tỷ hai trăm năm mươi triệu đồng'],
    [MAX_AMOUNT_VND, 'Một nghìn tỷ đồng'],
    [1_200_000_000_000, 'Một nghìn hai trăm tỷ đồng'],
    [1_005_000_000_000, 'Một nghìn không trăm lẻ năm tỷ đồng'],
    [1_000_005_000_000, 'Một nghìn tỷ không trăm lẻ năm triệu đồng'],
    [999_999_999_999_999, 'Chín trăm chín mươi chín nghìn chín trăm chín mươi chín tỷ chín trăm chín mươi chín triệu chín trăm chín mươi chín nghìn chín trăm chín mươi chín đồng'],
  ])('reads %i in Vietnamese as a receipt prints it', (amount, words) => {
    expect(vndInWords(vnd(amount), 'vi')).toBe(words);
  });

  it.each([
    [0, 'Zero dong'],
    [21, 'Twenty-one dong'],
    [3_500_000, 'Three million five hundred thousand dong'],
    [600_000_000, 'Six hundred million dong'],
    [1_250_000_000, 'One billion two hundred fifty million dong'],
    [MAX_AMOUNT_VND, 'One trillion dong'],
    [1_200_000_000_000, 'One trillion two hundred billion dong'],
  ])('reads %i in English', (amount, words) => {
    expect(vndInWords(vnd(amount), 'en')).toBe(words);
  });

  it('never says linh, whatever the amount', () => {
    for (const amount of [101, 105, 109, 1_005_000, 2_105_000, 1_001_001_001, 300_007_000_005]) expect(vndInWords(vnd(amount), 'vi')).not.toMatch(/\blinh\b/);
  });

  it('refuses a negative amount and one past a million tỷ', () => {
    expect(() => vndInWords(vnd(-1), 'vi')).toThrow(RangeError);
    expect(() => vndInWords(vnd(1e15), 'vi')).toThrow(RangeError);
  });
});
