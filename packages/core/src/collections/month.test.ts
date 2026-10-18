import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { boardMonthParam, parseBoardMonth } from './month';

const today = isoDate('2026-10-07');

describe('parseBoardMonth', () => {
  it('reads ?month=2026-09 as the first of September', () => {
    expect(parseBoardMonth('2026-09', today)).toBe('2026-09-01');
    expect(boardMonthParam(isoDate('2024-12-01'))).toBe('2024-12');
  });

  it.each([undefined, '', '2026-13', '2026-9', '2026-09-15', 'tháng 9', '0000-00'])('falls back to the Clock month for %o', (param) => {
    expect(parseBoardMonth(param, today)).toBe('2026-10-01');
  });
});
