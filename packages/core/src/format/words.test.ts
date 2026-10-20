import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_VND, vnd } from '../money/vnd';
import { vndInWords } from './words';

describe('vndInWords', () => {
  it.each([
    [0, 'Không đồng'],
    [15, 'Mười lăm đồng'],
    [21, 'Hai mươi mốt đồng'],
    [105, 'Một trăm lẻ năm đồng'],
    [111, 'Một trăm mười một đồng'],
    [3_500_000, 'Ba triệu năm trăm nghìn đồng'],
    [15_500_000, 'Mười lăm triệu năm trăm nghìn đồng'],
    [1_005_000, 'Một triệu không trăm lẻ năm nghìn đồng'],
    [1_000_025, 'Một triệu không trăm hai mươi lăm đồng'],
    [500_000_000, 'Năm trăm triệu đồng'],
    [600_000_000, 'Sáu trăm triệu đồng'],
    [1_250_000_000, 'Một tỷ hai trăm năm mươi triệu đồng'],
    [MAX_AMOUNT_VND, 'Một nghìn tỷ đồng'],
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
  ])('reads %i in English', (amount, words) => {
    expect(vndInWords(vnd(amount), 'en')).toBe(words);
  });

  it('refuses a negative amount and one past a million tỷ', () => {
    expect(() => vndInWords(vnd(-1), 'vi')).toThrow(RangeError);
    expect(() => vndInWords(vnd(1e15), 'vi')).toThrow(RangeError);
  });
});
