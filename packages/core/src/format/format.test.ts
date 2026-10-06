import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { formatArea, formatDate, formatDateLong, formatRelativeDue, formatVnd, formatVndCompact } from './index';

const NBSP = ' ';

describe('formatVnd', () => {
  it('matches DOMAIN-VN §9 with the NBSP before ₫', () => {
    expect(formatVnd(vnd(15_000_000), 'vi')).toBe(`15.000.000${NBSP}₫`);
  });

  it('formats zero and negatives', () => {
    expect(formatVnd(vnd(0), 'vi')).toBe(`0${NBSP}₫`);
    expect(formatVnd(vnd(-1_500_000), 'vi')).toBe(`-1.500.000${NBSP}₫`);
  });

  it('groups with commas in en and keeps ₫ after the amount', () => {
    expect(formatVnd(vnd(15_000_000), 'en')).toBe(`15,000,000${NBSP}₫`);
    expect(formatVnd(vnd(-1_500_000), 'en')).toBe(`-1,500,000${NBSP}₫`);
  });
});

describe('formatVndCompact', () => {
  it.each([
    [3_200_000_000, '3,2 tỷ', '3.2B ₫'],
    [1_250_000_000, '1,25 tỷ', '1.25B ₫'],
    [1_000_000_000, '1 tỷ', '1B ₫'],
    [999_999_999, '1 tỷ', '1B ₫'],
    [15_000_000, '15 tr', '15M ₫'],
    [15_500_000, '15,5 tr', '15.5M ₫'],
    [850_000, '850 nghìn', '850K ₫'],
  ])('%i reads %s in vi and %s in en', (amount, vi, en) => {
    expect(formatVndCompact(vnd(amount), 'vi')).toBe(vi);
    expect(formatVndCompact(vnd(amount), 'en')).toBe(en);
  });

  it('picks the unit after rounding at every boundary', () => {
    expect(formatVndCompact(vnd(999_950), 'vi')).toBe('1 tr');
    expect(formatVndCompact(vnd(949_999), 'vi')).toBe('950 nghìn');
    expect(formatVndCompact(vnd(989_949_999), 'vi')).toBe('989,9 tr');
    expect(formatVndCompact(vnd(994_999_999), 'vi')).toBe('995 tr');
  });

  it('trims trailing zeros and keeps at most 2 decimals for tỷ and 1 for tr', () => {
    expect(formatVndCompact(vnd(1_204_000_000), 'vi')).toBe('1,2 tỷ');
    expect(formatVndCompact(vnd(1_206_000_000), 'vi')).toBe('1,21 tỷ');
    expect(formatVndCompact(vnd(3_460_000), 'vi')).toBe('3,5 tr');
  });

  it('groups large tỷ counts and keeps the sign', () => {
    expect(formatVndCompact(vnd(1_234_000_000_000), 'vi')).toBe('1.234 tỷ');
    expect(formatVndCompact(vnd(-15_500_000), 'vi')).toBe('-15,5 tr');
    expect(formatVndCompact(vnd(-15_500_000), 'en')).toBe('-15.5M ₫');
  });

  it('falls back to the full amount when it rounds below one thousand', () => {
    expect(formatVndCompact(vnd(499), 'vi')).toBe(`499${NBSP}₫`);
    expect(formatVndCompact(vnd(500), 'vi')).toBe('1 nghìn');
    expect(formatVndCompact(vnd(0), 'en')).toBe(`0${NBSP}₫`);
  });
});

describe('formatArea', () => {
  it('matches DOMAIN-VN §9', () => {
    expect(formatArea(125.5, 'vi')).toBe('125,5 m²');
  });

  it('groups thousands and keeps up to 2 decimals', () => {
    expect(formatArea(1234.567, 'vi')).toBe('1.234,57 m²');
    expect(formatArea(1234.5, 'en')).toBe('1,234.5 m²');
    expect(formatArea(80, 'vi')).toBe('80 m²');
  });
});

describe('formatDate', () => {
  it('matches DOMAIN-VN §9 in both locales', () => {
    expect(formatDate(isoDate('2026-10-07'), 'vi')).toBe('07/10/2026');
    expect(formatDate(isoDate('2026-10-07'), 'en')).toBe('07/10/2026');
  });
});

describe('formatDateLong', () => {
  it('matches DOMAIN-VN §9 and the plan', () => {
    expect(formatDateLong(isoDate('2026-10-07'), 'vi')).toBe('Thứ Tư, 07/10/2026');
    expect(formatDateLong(isoDate('2026-10-07'), 'en')).toBe('Wednesday, 07/10/2026');
  });

  it.each([
    ['2026-10-04', 'Chủ Nhật', 'Sunday'],
    ['2026-10-05', 'Thứ Hai', 'Monday'],
    ['2026-10-06', 'Thứ Ba', 'Tuesday'],
    ['2026-10-08', 'Thứ Năm', 'Thursday'],
    ['2026-10-09', 'Thứ Sáu', 'Friday'],
    ['2026-10-10', 'Thứ Bảy', 'Saturday'],
    ['2000-01-01', 'Thứ Bảy', 'Saturday'],
    ['2024-02-29', 'Thứ Năm', 'Thursday'],
    ['1970-01-01', 'Thứ Năm', 'Thursday'],
  ])('%s is %s', (date, vi, en) => {
    expect(formatDateLong(isoDate(date), 'vi').startsWith(`${vi}, `)).toBe(true);
    expect(formatDateLong(isoDate(date), 'en').startsWith(`${en}, `)).toBe(true);
  });
});

describe('formatRelativeDue', () => {
  const today = isoDate('2026-10-07');

  it('matches DOMAIN-VN §9', () => {
    expect(formatRelativeDue(isoDate('2026-09-25'), today, 'vi')).toBe('quá hạn 12 ngày');
  });

  it.each([
    ['2026-09-25', 'quá hạn 12 ngày', '12 days overdue'],
    ['2026-10-06', 'quá hạn 1 ngày', '1 day overdue'],
    ['2026-10-07', 'đến hạn hôm nay', 'due today'],
    ['2026-10-08', 'còn 1 ngày', 'due in 1 day'],
    ['2026-10-25', 'còn 18 ngày', 'due in 18 days'],
    ['2027-01-01', 'còn 86 ngày', 'due in 86 days'],
  ])('due %s', (due, vi, en) => {
    expect(formatRelativeDue(isoDate(due), today, 'vi')).toBe(vi);
    expect(formatRelativeDue(isoDate(due), today, 'en')).toBe(en);
  });

  it('counts across a leap day', () => {
    expect(formatRelativeDue(isoDate('2024-02-28'), isoDate('2024-03-01'), 'vi')).toBe('quá hạn 2 ngày');
  });
});
