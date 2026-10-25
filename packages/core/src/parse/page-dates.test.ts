import { describe, expect, it } from 'vitest';
import { datesInText } from './page-dates';

describe('datesInText', () => {
  it('reads day-first dates with any separator, ISO dates and the spelled-out Vietnamese form', () => {
    const dates = datesInText('Đăng 5/10/2026, sửa 06-10-2026, lưu 2026-10-07; hiệu lực từ ngày 15 tháng 11 năm 2026 hoặc 1 tháng 1, 2027.');
    expect([...dates].toSorted()).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-11-15', '2027-01-01']);
  });

  it('skips impossible days and digits glued to a longer number', () => {
    expect([...datesInText('Số 31/02/2026 và mã 105/10/20261.')]).toEqual([]);
  });
});
